import { JsonFileCache } from "../../core/cache";
import {
  calculateFlightDistanceMiles,
  findAirlineByCode,
  findAirportByCode
} from "../../core/catalog";
import { optionAppearsToIncludeFreeCarryOnBag } from "../../core/fare-characteristics";
import {
  clampTimeWindow,
  combineBookingSources,
  combineTwoOneWays,
  mapWithConcurrency,
  prefersDirectBooking
} from "../../core/utils";
import type {
  DatePrice,
  FlightOption,
  FlightSlice,
  SearchRequest
} from "../../shared/types";
import {
  createGoogleFlightsClient,
  GoogleFlightsUnavailableError
} from "./client";
import { encodeCalendarSearch, encodeExactSearch } from "./encoding";
import {
  parseCalendarResponse,
  parseExactSearchResponse,
  parseGoogleFlightsPageDatePrices,
  parseGoogleFlightsPageResponse
} from "./parsing";
import type {
  CalendarSearchParams,
  ExactFlightSearchParams,
  GoogleFlightResult
} from "./types";

const calendarUrl =
  "https://www.google.com/_/FlightsFrontendUi/data/travel.frontend.flights.FlightsFrontendService/GetCalendarGraph";
const shoppingUrl =
  "https://www.google.com/_/FlightsFrontendUi/data/travel.frontend.flights.FlightsFrontendService/GetShoppingResults";
const roundTripFollowUpConcurrency = 2;
/** Cap shopping follow-ups per RT exact (cheapest outbounds first). */
const roundTripOutboundFollowUpLimit = 5;

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
    version: 5
  });

  private readonly exactSearchCache = new JsonFileCache<FlightOption[]>({
    directorySegments: [".cache", "google-flights", "exact"],
    ttlMs: 1000 * 60 * 20,
    maxEntries: 800,
    sweepIntervalMs: 1000 * 60 * 2,
    version: 10
  });

  constructor() {
    this.calendarCache.sweepExpired();
    this.exactSearchCache.sweepExpired();
  }

  private buildOneWayOptions(
    results: GoogleFlightResult[],
    params: ExactFlightSearchParams
  ): FlightOption[] {
    const options = this.applyDirectBookingPreference(
      results.map((result) =>
        this.toFlightOption(result, "google_one_way", params.departureDate)
      ),
      params.preferDirectBookingOnly
    );
    return this.applyFreeCarryOnRequirement(
      options,
      params.requireFreeCarryOnBag,
      params.cabinClass
    );
  }

  private async searchOneWayFromPage(
    params: ExactFlightSearchParams,
    runtimeOptions?: ExactSearchRuntimeOptions
  ): Promise<FlightOption[]> {
    const page = await this.client.getSearchPage(
      params.origin,
      params.destination,
      params.departureDate,
      undefined
    );
    const results = parseGoogleFlightsPageResponse(page);
    if (results.length === 0) {
      throw new GoogleFlightsUnavailableError(
        null,
        "Google Flights page returned no priced flight results."
      );
    }

    const options = this.buildOneWayOptions(results, params);
    if (runtimeOptions?.bypassCache !== true) {
      const cacheKey = { params, type: "exact" };
      await this.exactSearchCache.set(cacheKey, options);
    }
    return options;
  }

  private async searchRoundTripFromPages(
    params: ExactFlightSearchParams,
    runtimeOptions?: ExactSearchRuntimeOptions
  ): Promise<FlightOption[]> {
    if (!params.returnDate) {
      throw new GoogleFlightsUnavailableError(
        null,
        "Google Flights requires a return date for a round-trip search."
      );
    }

    const { selectedFlight: _selectedFlight, ...oneWayParams } = params;
    const [outbound, inbound] = await Promise.all([
      this.searchExactFlights(
        {
          ...oneWayParams,
          tripType: "one_way",
          departureDate: params.departureDate,
          origin: params.origin,
          destination: params.destination
        },
        runtimeOptions
      ),
      this.searchExactFlights(
        {
          ...oneWayParams,
          tripType: "one_way",
          departureDate: params.returnDate,
          origin: params.destination,
          destination: params.origin
        },
        runtimeOptions
      )
    ]);

    const options = outbound
      .slice(0, roundTripOutboundFollowUpLimit)
      .flatMap((outboundOption) =>
        inbound
          .slice(0, roundTripOutboundFollowUpLimit)
          .map((inboundOption) =>
            combineTwoOneWays(
              outboundOption,
              inboundOption,
              params.departureDate,
              params.returnDate as string
            )
          )
      )
      .sort((left, right) => left.totalPrice - right.totalPrice);
    if (options.length === 0) {
      throw new GoogleFlightsUnavailableError(
        null,
        "Google Flights returned no priced round-trip options."
      );
    }
    return options;
  }

  async searchDatePrices(params: CalendarSearchParams): Promise<DatePrice[]> {
    const normalizedParams = this.normalizeTimeWindows(params);
    const cacheKey = {
      params: normalizedParams,
      type: "calendar"
    };
    const cachedResults = await this.calendarCache.get(cacheKey);
    if (cachedResults) {
      return cachedResults;
    }

    const payload = encodeCalendarSearch(normalizedParams);
    let parsedResults: DatePrice[];
    try {
      const response = await this.client.post(calendarUrl, `f.req=${payload}`);
      parsedResults = parseCalendarResponse(response);
    } catch (error) {
      if (!(error instanceof GoogleFlightsUnavailableError)) {
        throw error;
      }

      // The internal batchexecute endpoint now rejects unsigned direct calls
      // with HTTP 200 / gRPC 13. The public page still returns live priced
      // data, so reuse its embedded date graph when available.
      const page = await this.client.getSearchPage(
        normalizedParams.origin,
        normalizedParams.destination,
        normalizedParams.travelDate
      );
      parsedResults = parseGoogleFlightsPageDatePrices(
        page,
        normalizedParams.fromDate,
        normalizedParams.toDate
      );
      if (parsedResults.length === 0) {
        const pageResults = parseGoogleFlightsPageResponse(page);
        const prices = pageResults.map((result) => result.price);
        const price = prices.length > 0 ? Math.min(...prices) : Number.NaN;
        if (!Number.isFinite(price)) {
          throw error;
        }
        parsedResults = [{ date: normalizedParams.fromDate, price }];
      }
    }

    // Skip nested exact timing annotation — core search annotates times after exacts.
    await this.calendarCache.set(cacheKey, parsedResults);
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
        ? await this.exactSearchCache.get(cacheKey)
        : null;
    if (cachedResults) {
      return cachedResults;
    }

    const payload = encodeExactSearch(normalizedParams);
    let results: GoogleFlightResult[];
    try {
      const response = await this.client.post(shoppingUrl, `f.req=${payload}`);
      results = parseExactSearchResponse(response);
    } catch (error) {
      if (!(error instanceof GoogleFlightsUnavailableError)) {
        throw error;
      }

      if (normalizedParams.tripType === "round_trip") {
        const fallbackOptions = await this.searchRoundTripFromPages(
          normalizedParams,
          runtimeOptions
        );
        await this.exactSearchCache.set(cacheKey, fallbackOptions);
        return fallbackOptions;
      }

      return this.searchOneWayFromPage(normalizedParams, runtimeOptions);
    }

    if (normalizedParams.tripType === "one_way") {
      const filteredOptions = this.buildOneWayOptions(results, normalizedParams);
      await this.exactSearchCache.set(cacheKey, filteredOptions);
      return filteredOptions;
    }

    const outboundCandidates = this.getRoundTripOutboundCandidates(
      results,
      normalizedParams.origin,
      normalizedParams.prioritizeMileFlights
    );

    const followUps = await mapWithConcurrency(
      outboundCandidates,
      roundTripFollowUpConcurrency,
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
    await this.exactSearchCache.set(cacheKey, filteredOptions);
    return filteredOptions;
  }

  private getRoundTripOutboundCandidates(
    results: GoogleFlightResult[],
    origin: string,
    prioritizeMileFlights = false
  ): GoogleFlightResult[] {
    const seen = new Set<string>();

    const filtered = results.filter(
      (result) => result.legs[0]?.departureAirportCode === origin
    );

    const decorated = filtered.map((result) => ({
      result,
      distanceMiles: prioritizeMileFlights
        ? calculateFlightDistanceMiles(result.legs)
        : 0
    }));

    decorated.sort((left, right) => {
      if (left.result.price !== right.result.price) {
        return left.result.price - right.result.price;
      }

      if (prioritizeMileFlights) {
        return right.distanceMiles - left.distanceMiles;
      }

      return 0;
    });

    return decorated
      .map((item) => item.result)
      .filter((result) => {
        const key = result.legs
          .map((leg) =>
            [
              leg.departureAirportCode,
              leg.arrivalAirportCode,
              leg.airlineCode,
              leg.flightNumber,
              leg.departureDateTime,
              leg.arrivalDateTime
            ].join(":")
          )
          .join("|");

        if (seen.has(key)) {
          return false;
        }

        seen.add(key);
        return true;
      })
      .slice(0, roundTripOutboundFollowUpLimit);
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
      requireFreeCarryOnBag: request.requireFreeCarryOnBag,
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
        const distanceMiles = calculateFlightDistanceMiles([leg]);

        return {
          airlineCode: leg.airlineCode,
          airlineName: airline?.name ?? leg.airlineName ?? leg.airlineCode,
          flightNumber: leg.flightNumber,
          departureAirportCode: leg.departureAirportCode,
          departureAirportName:
            departureAirport?.name ?? leg.departureAirportCode,
          departureDateTime: leg.departureDateTime,
          arrivalAirportCode: leg.arrivalAirportCode,
          arrivalAirportName: arrivalAirport?.name ?? leg.arrivalAirportCode,
          arrivalDateTime: leg.arrivalDateTime,
          durationMinutes: leg.durationMinutes,
          distanceMiles
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
