import { JsonFileCache } from "../../core/cache";
import { findAirlineByCode, findAirportByCode } from "../../core/catalog";
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

export class GoogleFlightsProvider {
  private readonly client = createGoogleFlightsClient();

  private readonly calendarCache = new JsonFileCache<DatePrice[]>({
    directorySegments: [".cache", "google-flights", "calendar"],
    ttlMs: 1000 * 60 * 30,
    maxEntries: 300,
    sweepIntervalMs: 1000 * 60 * 2
  });

  private readonly exactSearchCache = new JsonFileCache<FlightOption[]>({
    directorySegments: [".cache", "google-flights", "exact"],
    ttlMs: 1000 * 60 * 20,
    maxEntries: 800,
    sweepIntervalMs: 1000 * 60 * 2
  });

  constructor() {
    this.calendarCache.sweepExpired();
    this.exactSearchCache.sweepExpired();
  }

  async searchDatePrices(params: CalendarSearchParams): Promise<DatePrice[]> {
    const normalizedParams = this.normalizeTimeWindows(params);
    const cacheKey = {
      params: normalizedParams,
      type: "calendar",
      version: 2
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
    params: ExactFlightSearchParams
  ): Promise<FlightOption[]> {
    const normalizedParams = this.normalizeTimeWindows(params);
    const cacheKey = {
      params: normalizedParams,
      type: "exact",
      version: 3
    };
    const cachedResults = this.exactSearchCache.get(cacheKey);
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
      this.exactSearchCache.set(cacheKey, options);
      return options;
    }

    const directPairs = this.buildRoundTripPairsFromSingleResponse(
      results,
      normalizedParams.origin,
      normalizedParams.destination
    );

    if (directPairs.length > 0) {
      const options = this.applyDirectBookingPreference(
        directPairs.map(([outbound, inbound]) =>
          this.toRoundTripOption(
            outbound,
            inbound,
            normalizedParams.departureDate,
            normalizedParams.returnDate
          )
        ),
        normalizedParams.preferDirectBookingOnly
      );
      this.exactSearchCache.set(cacheKey, options);
      return options;
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
        return followUpResults.map((returnFlight) =>
          this.toRoundTripOption(
            selectedFlight,
            returnFlight,
            normalizedParams.departureDate,
            normalizedParams.returnDate
          )
        );
      }
    );

    const options = this.applyDirectBookingPreference(
      followUps.flat(),
      normalizedParams.preferDirectBookingOnly
    );
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

  private buildRoundTripPairsFromSingleResponse(
    results: GoogleFlightResult[],
    origin: string,
    destination: string
  ): Array<[GoogleFlightResult, GoogleFlightResult]> {
    const outbound = results.filter(
      (flight) =>
        flight.legs[0]?.departureAirportCode === origin &&
        flight.legs[flight.legs.length - 1]?.arrivalAirportCode === destination
    );

    const inbound = results.filter(
      (flight) =>
        flight.legs[0]?.departureAirportCode === destination &&
        flight.legs[flight.legs.length - 1]?.arrivalAirportCode === origin
    );

    const pairs: Array<[GoogleFlightResult, GoogleFlightResult]> = [];
    for (const left of outbound.slice(0, 4)) {
      for (const right of inbound.slice(0, 4)) {
        pairs.push([left, right]);
      }
    }

    return pairs;
  }

  private toRoundTripOption(
    outbound: GoogleFlightResult,
    inbound: GoogleFlightResult,
    departureDate: string,
    returnDate?: string
  ): FlightOption {
    return {
      source: "google_round_trip",
      totalPrice: outbound.price + inbound.price,
      currency: "USD",
      slices: [this.toSlice(outbound), this.toSlice(inbound)],
      slicePrices: [outbound.price, inbound.price],
      bookingSource: combineBookingSources([
        outbound.bookingSource,
        inbound.bookingSource
      ]),
      outboundDate: departureDate,
      returnDate,
      notes: ["Combined from Google Flights round-trip candidate results"]
    };
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
}
