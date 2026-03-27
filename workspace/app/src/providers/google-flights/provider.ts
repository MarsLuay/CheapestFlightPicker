import { JsonFileCache } from "../../core/cache";
import { findAirlineByCode, findAirportByCode } from "../../core/catalog";
import { optionAppearsToIncludeFreeCarryOnBag } from "../../core/fare-characteristics";
import {
  clampTimeWindow,
  combineBookingSources,
  mapWithConcurrency,
  prefersDirectBooking
} from "../../core/utils";
import type {
  DatePrice,
  FlightOption,
  FlightSlice,
  SearchRequest
} from "../../shared/types";
import { createGoogleFlightsClient } from "./client";
import { encodeCalendarSearch, encodeExactSearch } from "./encoding";
import { parseCalendarResponse, parseExactSearchResponse } from "./parsing";
import type {
  CalendarSearchParams,
  ExactFlightSearchParams,
  GoogleFlightResult
} from "./types";

const calendarUrl =
  "https://www.google.com/_/FlightsFrontendUi/data/travel.frontend.flights.FlightsFrontendService/GetCalendarGraph";
const shoppingUrl =
  "https://www.google.com/_/FlightsFrontendUi/data/travel.frontend.flights.FlightsFrontendService/GetShoppingResults";

type ExactSearchRuntimeOptions = {
  bypassCache?: boolean;
};

export class GoogleFlightsProvider {
  private readonly client = createGoogleFlightsClient();

  private readonly calendarCache = new JsonFileCache<DatePrice[]>({
    directorySegments: [".cache", "google-flights", "calendar"],
    ttlMs: 1000 * 60 * 30,
    maxEntries: 300,
    sweepIntervalMs: 1000 * 60 * 2,
    version: 2
  });

  private readonly exactSearchCache = new JsonFileCache<FlightOption[]>({
    directorySegments: [".cache", "google-flights", "exact"],
    ttlMs: 1000 * 60 * 20,
    maxEntries: 800,
    sweepIntervalMs: 1000 * 60 * 2,
    version: 6
  });

  constructor() {
    this.calendarCache.sweepExpired();
    this.exactSearchCache.sweepExpired();
  }

  async searchDatePrices(params: CalendarSearchParams): Promise<DatePrice[]> {
    const normalizedParams = this.normalizeTimeWindows(params);
    const cacheKey = {
      params: normalizedParams,
      type: "calendar"
    };
    const cachedResults = this.calendarCache.get(cacheKey);
    if (cachedResults) {
      return cachedResults;
    }

    const payload = encodeCalendarSearch(normalizedParams);
    const response = await this.client.post(calendarUrl, `f.req=${payload}`);
    const parsedResults = parseCalendarResponse(response);
    this.calendarCache.set(cacheKey, parsedResults);
    return parsedResults;
  }

  async searchExactFlights(
    params: ExactFlightSearchParams,
    runtimeOptions?: ExactSearchRuntimeOptions
  ): Promise<FlightOption[]> {
    const normalizedParams = this.normalizeTimeWindows(params);
    const cacheKey = {
      params: normalizedParams,
      type: "exact"
    };
    const cachedResults =
      runtimeOptions?.bypassCache !== true
        ? this.exactSearchCache.get(cacheKey)
        : null;
    if (cachedResults) {
      return cachedResults;
    }

    const payload = encodeExactSearch(normalizedParams);
    const response = await this.client.post(shoppingUrl, `f.req=${payload}`);
    const results = parseExactSearchResponse(response);

    if (normalizedParams.tripType === "one_way") {
      const options = this.applyDirectBookingPreference(
        results.map((result) =>
          this.toFlightOption(
            result,
            "google_one_way",
            normalizedParams.departureDate
          )
        ),
        normalizedParams.preferDirectBookingOnly
      );
      const filteredOptions = this.applyFreeCarryOnRequirement(
        options,
        normalizedParams.requireFreeCarryOnBag,
        normalizedParams.cabinClass
      );
      this.exactSearchCache.set(cacheKey, filteredOptions);
      return filteredOptions;
    }

    const outboundCandidates = results
      .filter(
        (result) =>
          result.legs[0]?.departureAirportCode === normalizedParams.origin
      )
      .slice(0, 3);

    const followUps = await mapWithConcurrency(
      outboundCandidates,
      2,
      async (selectedFlight) => {
        const followUpPayload = encodeExactSearch({
          ...normalizedParams,
          selectedFlight
        });

        const followUpResponse = await this.client.post(
          shoppingUrl,
          `f.req=${followUpPayload}`
        );
        const followUpResults = parseExactSearchResponse(followUpResponse);
        return followUpResults
          .filter((returnFlight) =>
            this.looksLikeSingleBookingRoundTrip(selectedFlight, returnFlight)
          )
          .map((returnFlight) =>
            this.toRoundTripOption(
              selectedFlight,
              returnFlight,
              normalizedParams.departureDate,
              normalizedParams.returnDate,
              returnFlight.price
            )
          );
      }
    );

    const options = this.applyDirectBookingPreference(
      followUps.flat(),
      normalizedParams.preferDirectBookingOnly
    );
    const filteredOptions = this.applyFreeCarryOnRequirement(
      options,
      normalizedParams.requireFreeCarryOnBag,
      normalizedParams.cabinClass
    );
    this.exactSearchCache.set(cacheKey, filteredOptions);
    return filteredOptions;
  }

  async searchOneWayWithinWindow(
    request: SearchRequest,
    origin: string,
    destination: string,
    fromDate: string,
    toDate: string
  ): Promise<DatePrice[]> {
    return this.searchDatePrices({
      origin,
      destination,
      fromDate,
      toDate,
      travelDate: fromDate,
      cabinClass: request.cabinClass,
      stopsFilter: request.stopsFilter,
      airlines: request.airlines,
      passengers: request.passengers,
      departureTimeWindow: request.departureTimeWindow ?? undefined,
      arrivalTimeWindow: request.arrivalTimeWindow ?? undefined
    });
  }

  private toRoundTripOption(
    outbound: GoogleFlightResult,
    inbound: GoogleFlightResult,
    departureDate: string,
    returnDate?: string,
    totalPrice = inbound.price
  ): FlightOption {
    return {
      source: "google_round_trip",
      totalPrice,
      currency: "USD",
      slices: [this.toSlice(outbound), this.toSlice(inbound)],
      bookingSource: combineBookingSources([
        outbound.bookingSource,
        inbound.bookingSource
      ]),
      outboundDate: departureDate,
      returnDate,
      notes: [
        "Combined from Google Flights round-trip candidate results",
        "Google Flights priced this as a full round-trip total"
      ]
    };
  }

  private looksLikeSingleBookingRoundTrip(
    outbound: GoogleFlightResult,
    inbound: GoogleFlightResult
  ): boolean {
    const outboundSource = outbound.bookingSource;
    const inboundSource = inbound.bookingSource;

    if (!outboundSource.detected || !inboundSource.detected) {
      return true;
    }

    if (outboundSource.type !== inboundSource.type) {
      return false;
    }

    const outboundSeller = outboundSource.sellerName?.trim().toLowerCase();
    const inboundSeller = inboundSource.sellerName?.trim().toLowerCase();

    if (outboundSeller && inboundSeller) {
      return outboundSeller === inboundSeller;
    }

    return true;
  }

  private toFlightOption(
    result: GoogleFlightResult,
    source: FlightOption["source"],
    departureDate: string
  ): FlightOption {
    return {
      source,
      totalPrice: result.price,
      currency: "USD",
      slices: [this.toSlice(result)],
      slicePrices: [result.price],
      bookingSource: result.bookingSource,
      outboundDate: departureDate
    };
  }

  private toSlice(result: GoogleFlightResult): FlightSlice {
    return {
      durationMinutes: result.durationMinutes,
      stops: result.stops,
      legs: result.legs.map((leg) => {
        const airline = findAirlineByCode(leg.airlineCode);
        const departureAirport = findAirportByCode(leg.departureAirportCode);
        const arrivalAirport = findAirportByCode(leg.arrivalAirportCode);

        return {
          airlineCode: leg.airlineCode,
          airlineName: airline?.name ?? leg.airlineName ?? leg.airlineCode,
          flightNumber: leg.flightNumber,
          departureAirportCode: leg.departureAirportCode,
          departureAirportName:
            departureAirport?.name ?? leg.departureAirportCode,
          departureDateTime: leg.departureDateTime.toISOString(),
          arrivalAirportCode: leg.arrivalAirportCode,
          arrivalAirportName: arrivalAirport?.name ?? leg.arrivalAirportCode,
          arrivalDateTime: leg.arrivalDateTime.toISOString(),
          durationMinutes: leg.durationMinutes
        };
      })
    };
  }

  private normalizeTimeWindows<T extends {
    arrivalTimeWindow?: SearchRequest["arrivalTimeWindow"];
    departureTimeWindow?: SearchRequest["departureTimeWindow"];
  }>(params: T): T {
    return {
      ...params,
      departureTimeWindow: clampTimeWindow(params.departureTimeWindow),
      arrivalTimeWindow: clampTimeWindow(params.arrivalTimeWindow)
    };
  }

  private applyDirectBookingPreference(
    options: FlightOption[],
    preferDirectBookingOnly: boolean | undefined
  ): FlightOption[] {
    if (!preferDirectBookingOnly) {
      return options;
    }

    return options.filter((option) => prefersDirectBooking(option.bookingSource));
  }

  private applyFreeCarryOnRequirement(
    options: FlightOption[],
    requireFreeCarryOnBag: boolean | undefined,
    cabinClass: string
  ): FlightOption[] {
    if (!requireFreeCarryOnBag) {
      return options;
    }

    return options.filter((option) =>
      optionAppearsToIncludeFreeCarryOnBag(option, cabinClass)
    );
  }
}
