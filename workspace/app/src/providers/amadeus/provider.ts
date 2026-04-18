import { JsonFileCache } from "../../core/cache";
import { findAirlineByCode, findAirportByCode } from "../../core/catalog";
import { optionAppearsToIncludeFreeCarryOnBag } from "../../core/fare-characteristics";
import { findCheapest, clampTimeWindow } from "../../core/utils";
import type { SearchProviderRuntimeOptions } from "../../core/search-provider";
import type {
  DatePrice,
  FlightOption,
  FlightSlice,
  SearchRequest,
  TimeWindow
} from "../../shared/types";
import {
  AmadeusClient,
  createAmadeusClientFromEnv
} from "./client";
import type { AmadeusFlightOffer, AmadeusFlightOfferSearchParams } from "./types";
import type {
  CalendarSearchParams,
  ExactFlightSearchParams
} from "../google-flights/types";

const dayMs = 24 * 60 * 60 * 1000;
const exactSearchCacheTtlMs = 1000 * 60 * 20;
const searchWindowConcurrency = 2;

type AmadeusItinerary = NonNullable<AmadeusFlightOffer["itineraries"]>[number];
type AmadeusSegment = NonNullable<AmadeusItinerary["segments"]>[number];

function buildDateRange(fromDate: string, toDate: string): string[] {
  const start = new Date(`${fromDate}T00:00:00.000Z`);
  const end = new Date(`${toDate}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    return [];
  }

  const dates: string[] = [];
  for (let cursor = start; cursor <= end; cursor = new Date(cursor.getTime() + dayMs)) {
    dates.push(cursor.toISOString().slice(0, 10));
  }

  return dates;
}

function parseAmount(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseIsoDurationToMinutes(value: string | undefined): number {
  if (!value) {
    return 0;
  }

  const match = value.match(
    /^P(?:(?<days>\d+)D)?(?:T(?:(?<hours>\d+)H)?(?:(?<minutes>\d+)M)?)?$/u
  );
  if (!match?.groups) {
    return 0;
  }

  const days = Number.parseInt(match.groups.days ?? "0", 10);
  const hours = Number.parseInt(match.groups.hours ?? "0", 10);
  const minutes = Number.parseInt(match.groups.minutes ?? "0", 10);
  return days * 24 * 60 + hours * 60 + minutes;
}

function mapCabinClass(
  cabinClass: SearchRequest["cabinClass"]
): AmadeusFlightOfferSearchParams["travelClass"] {
  switch (cabinClass) {
    case "premium_economy":
      return "PREMIUM_ECONOMY";
    case "business":
      return "BUSINESS";
    case "first":
      return "FIRST";
    default:
      return "ECONOMY";
  }
}

function getStopsLimit(stopsFilter: SearchRequest["stopsFilter"]): number {
  switch (stopsFilter) {
    case "nonstop":
      return 0;
    case "max_1_stop":
      return 1;
    case "max_2_stops":
      return 2;
    default:
      return Number.POSITIVE_INFINITY;
  }
}

function getHourFromLocalDateTime(value: string): number | null {
  const match = value.match(/T(\d{2}):(\d{2})/u);
  if (!match) {
    return null;
  }

  const hour = Number.parseInt(match[1] ?? "", 10);
  return Number.isFinite(hour) ? hour : null;
}

function matchesTimeWindow(
  value: string,
  window: TimeWindow | undefined
): boolean {
  if (!window) {
    return true;
  }

  const hour = getHourFromLocalDateTime(value);
  if (hour === null) {
    return true;
  }

  return hour >= window.from && hour <= window.to;
}

function getSegmentAirlineCode(
  segment: AmadeusSegment
): string {
  return segment.operating?.carrierCode ?? segment.carrierCode ?? "Unknown";
}

function createBookingSource(option: FlightOption, offer: AmadeusFlightOffer) {
  const validatingAirlineCode = Array.isArray(offer.validatingAirlineCodes)
    ? offer.validatingAirlineCodes.find(
        (code): code is string => typeof code === "string" && Boolean(code)
      )
    : undefined;
  const fallbackAirlineCode = option.slices[0]?.legs[0]?.airlineCode;
  const airlineCode = validatingAirlineCode ?? fallbackAirlineCode;
  const sellerName = airlineCode
    ? findAirlineByCode(airlineCode)?.name ?? airlineCode
    : undefined;

  if (!sellerName) {
    return {
      type: "unknown" as const,
      label: "Booking source not confirmed",
      detected: false
    };
  }

  return {
    type: "direct_airline" as const,
    label: `Direct with ${sellerName}`,
    sellerName,
    detected: true
  };
}

function normalizeCalendarParams(
  params: CalendarSearchParams
): CalendarSearchParams {
  return {
    ...params,
    departureTimeWindow: clampTimeWindow(params.departureTimeWindow),
    arrivalTimeWindow: clampTimeWindow(params.arrivalTimeWindow)
  };
}

function normalizeExactParams(
  params: ExactFlightSearchParams
): ExactFlightSearchParams {
  return {
    ...params,
    departureTimeWindow: clampTimeWindow(params.departureTimeWindow),
    arrivalTimeWindow: clampTimeWindow(params.arrivalTimeWindow)
  };
}

function buildOfferSearchParams(
  params: ExactFlightSearchParams
): AmadeusFlightOfferSearchParams {
  const passengers = params.passengers;
  const infants = passengers.infantsInSeat + passengers.infantsOnLap;

  return {
    originLocationCode: params.origin,
    destinationLocationCode: params.destination,
    departureDate: params.departureDate,
    returnDate: params.tripType === "round_trip" ? params.returnDate : undefined,
    adults: passengers.adults,
    children: passengers.children > 0 ? passengers.children : undefined,
    infants: infants > 0 ? infants : undefined,
    currencyCode: "USD",
    max: params.tripType === "round_trip" ? 20 : 30,
    nonStop: params.stopsFilter === "nonstop" ? true : undefined,
    travelClass: mapCabinClass(params.cabinClass as SearchRequest["cabinClass"]),
    includedAirlineCodes:
      params.airlines.length > 0 ? params.airlines.join(",") : undefined
  };
}

export class AmadeusFlightSearchProvider {
  private readonly exactSearchCache = new JsonFileCache<FlightOption[]>({
    directorySegments: [".cache", "amadeus", "flight-offers"],
    ttlMs: exactSearchCacheTtlMs,
    maxEntries: 800,
    sweepIntervalMs: 1000 * 60 * 2,
    version: 1
  });

  constructor(private readonly client: Pick<AmadeusClient, "searchFlightOffers">) {
    this.exactSearchCache.sweepExpired();
  }

  async searchExactFlights(
    params: ExactFlightSearchParams,
    runtimeOptions?: SearchProviderRuntimeOptions
  ): Promise<FlightOption[]> {
    const normalizedParams = normalizeExactParams(params);
    const cacheKey = {
      params: normalizedParams,
      type: "amadeus_exact"
    };
    const cachedResults =
      runtimeOptions?.bypassCache === true
        ? null
        : this.exactSearchCache.get(cacheKey);
    if (cachedResults) {
      return cachedResults;
    }

    const offers = await this.client.searchFlightOffers(
      buildOfferSearchParams(normalizedParams)
    );
    const options = offers
      .map((offer) => this.toFlightOption(offer, normalizedParams))
      .filter((option): option is FlightOption => option !== null)
      .filter((option) =>
        this.matchesStopsFilter(
          option,
          normalizedParams.stopsFilter as SearchRequest["stopsFilter"]
        )
      )
      .filter((option) =>
        option.slices.every(
          (slice) =>
            matchesTimeWindow(
              slice.legs[0]?.departureDateTime ?? "",
              normalizedParams.departureTimeWindow
            ) &&
            matchesTimeWindow(
              slice.legs[slice.legs.length - 1]?.arrivalDateTime ?? "",
              normalizedParams.arrivalTimeWindow
            )
        )
      )
      .filter((option) =>
        optionAppearsToIncludeFreeCarryOnBag(option, normalizedParams.cabinClass)
      )
      .sort((left, right) => left.totalPrice - right.totalPrice);

    this.exactSearchCache.set(cacheKey, options);
    return options;
  }

  async searchOneWayWithinWindow(
    request: SearchRequest,
    origin: string,
    destination: string,
    fromDate: string,
    toDate: string
  ): Promise<DatePrice[]> {
    const normalizedParams = normalizeCalendarParams({
      origin,
      destination,
      fromDate,
      toDate,
      travelDate: fromDate,
      cabinClass: request.cabinClass,
      stopsFilter: request.stopsFilter,
      requireFreeCarryOnBag: request.requireFreeCarryOnBag,
      airlines: request.airlines,
      passengers: request.passengers,
      departureTimeWindow: request.departureTimeWindow ?? undefined,
      arrivalTimeWindow: request.arrivalTimeWindow ?? undefined
    });

    const dates = buildDateRange(
      normalizedParams.fromDate,
      normalizedParams.toDate
    );
    const results: Array<DatePrice | null> = new Array(dates.length).fill(null);
    let index = 0;

    async function worker(
      provider: AmadeusFlightSearchProvider
    ): Promise<void> {
      while (index < dates.length) {
        const currentIndex = index;
        index += 1;
        const departureDate = dates[currentIndex];
        const options = await provider.searchExactFlights({
          tripType: "one_way",
          origin,
          destination,
          departureDate,
          cabinClass: request.cabinClass,
          stopsFilter: request.stopsFilter,
          preferDirectBookingOnly: request.preferDirectBookingOnly,
          requireFreeCarryOnBag: request.requireFreeCarryOnBag,
          airlines: request.airlines,
          passengers: request.passengers,
          departureTimeWindow: request.departureTimeWindow ?? undefined,
          arrivalTimeWindow: request.arrivalTimeWindow ?? undefined
        });
        const cheapest = findCheapest(options);
        results[currentIndex] = cheapest
          ? {
              date: departureDate,
              price: cheapest.totalPrice
            }
          : null;
      }
    }

    await Promise.all(
      Array.from(
        { length: Math.min(searchWindowConcurrency, Math.max(1, dates.length)) },
        () => worker(this)
      )
    );

    return results.filter((entry): entry is DatePrice => entry !== null);
  }

  private matchesStopsFilter(
    option: FlightOption,
    stopsFilter: SearchRequest["stopsFilter"]
  ): boolean {
    const stopsLimit = getStopsLimit(stopsFilter);
    return option.slices.every((slice) => slice.stops <= stopsLimit);
  }

  private toFlightOption(
    offer: AmadeusFlightOffer,
    params: ExactFlightSearchParams
  ): FlightOption | null {
    const itineraries = Array.isArray(offer.itineraries) ? offer.itineraries : [];
    const slices = itineraries
      .map((itinerary) => this.toSlice(itinerary))
      .filter((slice): slice is FlightSlice => slice !== null);
    const totalPrice = parseAmount(offer.price?.total ?? offer.price?.grandTotal);
    const currency = offer.price?.currency;

    if (
      slices.length === 0 ||
      totalPrice === null ||
      typeof currency !== "string" ||
      !currency
    ) {
      return null;
    }

    const source =
      params.tripType === "round_trip" ? "google_round_trip" : "google_one_way";
    const option: FlightOption = {
      source,
      totalPrice,
      currency,
      slices,
      slicePrices: params.tripType === "one_way" ? [totalPrice] : undefined,
      bookingSource: {
        type: "unknown",
        label: "Booking source not confirmed",
        detected: false
      },
      outboundDate: params.departureDate,
      returnDate: params.tripType === "round_trip" ? params.returnDate : undefined,
      notes: [
        "Hosted search priced through Amadeus because Google Flights blocks serverless traffic."
      ]
    };

    option.bookingSource = createBookingSource(option, offer);
    return option;
  }

  private toSlice(
    itinerary: AmadeusItinerary
  ): FlightSlice | null {
    const segments = Array.isArray(itinerary.segments) ? itinerary.segments : [];
    if (segments.length === 0) {
      return null;
    }

    return {
      durationMinutes: parseIsoDurationToMinutes(itinerary.duration),
      stops: Math.max(0, segments.length - 1),
      legs: segments.map((segment: AmadeusSegment) => {
        const airlineCode = getSegmentAirlineCode(segment);
        const airline = findAirlineByCode(airlineCode);
        const departureAirport = findAirportByCode(
          segment.departure?.iataCode ?? ""
        );
        const arrivalAirport = findAirportByCode(segment.arrival?.iataCode ?? "");

        return {
          airlineCode,
          airlineName: airline?.name ?? airlineCode,
          flightNumber: segment.number ?? "Unknown",
          departureAirportCode: segment.departure?.iataCode ?? "Unknown",
          departureAirportName:
            departureAirport?.name ?? segment.departure?.iataCode ?? "Unknown",
          departureDateTime: segment.departure?.at ?? "",
          arrivalAirportCode: segment.arrival?.iataCode ?? "Unknown",
          arrivalAirportName:
            arrivalAirport?.name ?? segment.arrival?.iataCode ?? "Unknown",
          arrivalDateTime: segment.arrival?.at ?? "",
          durationMinutes: parseIsoDurationToMinutes(segment.duration)
        };
      })
    };
  }
}

export function createAmadeusFlightSearchProviderFromEnv():
  | AmadeusFlightSearchProvider
  | null {
  const client = createAmadeusClientFromEnv();
  return client ? new AmadeusFlightSearchProvider(client) : null;
}
