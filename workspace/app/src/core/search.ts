import { BookingSourceSupplementService } from "./booking-source-supplement";
import { findAirlineByCode, findAirportByCode } from "./catalog";
import { TimingGuidanceService } from "./timing-guidance";
import {
  combineTwoOneWays,
  findCheapest,
  findCheapestDirectThere,
  findCheapestMultiStop,
  isLikelyDirectAirlineBookingOption,
  mapWithConcurrency
} from "./utils";
import { createAmadeusMissingInfoSupplementProviderFromEnv } from "../providers/amadeus/missing-info-supplement";
import { GoogleFlightsProvider } from "../providers/google-flights/provider";
import { searchRequestSchema } from "../shared/schemas";
import type {
  DatePrice,
  FlightOption,
  SearchProgress,
  SearchRequest,
  SearchSummary
} from "../shared/types";

type CandidatePair = {
  departureDate: string;
  returnDate?: string;
};

type ScoredCandidatePair = CandidatePair & {
  estimatedTotalPrice: number;
};

const dayMs = 24 * 60 * 60 * 1000;
const directBookingSupplementTargetCount = 6;

function differenceInDays(startDate: string, endDate: string): number {
  return Math.floor(
    (new Date(endDate).getTime() - new Date(startDate).getTime()) / dayMs
  );
}

type SearchProgressReporter = (progress: SearchProgress) => void;

class ProgressTracker {
  private completedSteps = 0;

  private currentDetail: string | undefined;

  private currentStage = "Preparing search";

  constructor(
    private totalSteps: number,
    private readonly reporter?: SearchProgressReporter
  ) {
    this.totalSteps = Math.max(1, totalSteps);
    this.emit();
  }

  setStage(stage: string, detail?: string): void {
    this.currentStage = stage;
    this.currentDetail = detail;
    this.emit();
  }

  setTotalSteps(totalSteps: number, detail?: string): void {
    this.totalSteps = Math.max(this.completedSteps || 1, totalSteps);
    if (detail) {
      this.currentDetail = detail;
    }
    this.emit();
  }

  completeStep(stage: string, detail?: string): void {
    this.completedSteps = Math.min(this.completedSteps + 1, this.totalSteps);
    this.currentStage = stage;
    this.currentDetail = detail;
    this.emit();
  }

  finish(detail?: string): void {
    this.completedSteps = this.totalSteps;
    this.currentStage = "Completed";
    this.currentDetail = detail;
    this.emit();
  }

  private emit(): void {
    this.reporter?.({
      stage: this.currentStage,
      detail: this.currentDetail,
      completedSteps: this.completedSteps,
      totalSteps: this.totalSteps,
      percent: Math.max(
        0,
        Math.min(100, Math.round((this.completedSteps / this.totalSteps) * 100))
      )
    });
  }
}

export class FlightSearchService {
  private readonly provider = new GoogleFlightsProvider();

  private readonly timingGuidanceService = new TimingGuidanceService();

  private readonly bookingSourceSupplementService =
    new BookingSourceSupplementService(
      (() => {
        const amadeusProvider =
          createAmadeusMissingInfoSupplementProviderFromEnv();
        return amadeusProvider ? [amadeusProvider] : [];
      })()
    );

  private async refineOptionsForDirectBookingPreference(
    options: FlightOption[],
    request: SearchRequest
  ): Promise<FlightOption[]> {
    if (!request.preferDirectBookingOnly || options.length === 0) {
      return options;
    }

    const supplementedOptions =
      await this.bookingSourceSupplementService.supplementOptions(
        options,
        request,
        Math.min(
          options.length,
          Math.max(request.maxResults, directBookingSupplementTargetCount)
        )
      );

    const likelyDirectOptions = supplementedOptions.filter(
      isLikelyDirectAirlineBookingOption
    );

    return likelyDirectOptions.length > 0 ? likelyDirectOptions : supplementedOptions;
  }

  private buildOneWaySupplementRequest(
    request: SearchRequest,
    origin: string,
    destination: string,
    departureDate: string
  ): SearchRequest {
    return {
      ...request,
      tripType: "one_way",
      origin,
      destination,
      departureDateFrom: departureDate,
      departureDateTo: departureDate,
      returnDateFrom: undefined,
      returnDateTo: undefined
    };
  }

  async search(
    input: unknown,
    progressReporter?: SearchProgressReporter
  ): Promise<SearchSummary> {
    const request = searchRequestSchema.parse(input);
    this.ensureReferenceDataExists(request);

    if (request.tripType === "one_way") {
      return this.searchOneWay(request, progressReporter);
    }

    return this.searchRoundTrip(request, progressReporter);
  }

  private async searchOneWay(
    request: SearchRequest,
    progressReporter?: SearchProgressReporter
  ): Promise<SearchSummary> {
    const candidateDepth = Math.max(request.maxResults, 5);
    const tracker = new ProgressTracker(2 + candidateDepth, progressReporter);

    tracker.setStage(
      "Scanning departure date range",
      "Looking for the cheapest outbound dates"
    );
    const departureDatePrices = await this.provider.searchOneWayWithinWindow(
      request,
      request.origin,
      request.destination,
      request.departureDateFrom,
      request.departureDateTo
    );
    tracker.completeStep(
      "Departure date range scanned",
      `Found ${departureDatePrices.length} departure date candidates`
    );

    const candidateDates = departureDatePrices.slice(
      0,
      candidateDepth
    );
    tracker.setTotalSteps(
      2 + candidateDates.length,
      `Inspecting ${candidateDates.length} exact flight searches`
    );

    let completedLookups = 0;
    const optionsByDate = await mapWithConcurrency(
      candidateDates,
      2,
      async (entry) => {
        const options = await this.provider.searchExactFlights({
          tripType: "one_way",
          origin: request.origin,
          destination: request.destination,
          departureDate: entry.date,
          cabinClass: request.cabinClass,
          stopsFilter: request.stopsFilter,
          preferDirectBookingOnly: request.preferDirectBookingOnly,
          airlines: request.airlines,
          passengers: request.passengers,
          departureTimeWindow: request.departureTimeWindow ?? undefined,
          arrivalTimeWindow: request.arrivalTimeWindow ?? undefined
        });
        completedLookups += 1;
        tracker.completeStep(
          "Checking exact flight options",
          `${completedLookups} of ${candidateDates.length} exact fare lookups finished`
        );
        return options;
      }
    );

    let options = optionsByDate.flat().slice(0, request.maxResults * 4);
    options = await this.refineOptionsForDirectBookingPreference(options, request);
    const cheapestOverall = findCheapest(options);
    const cheapestDirectThere = findCheapestDirectThere(options);
    tracker.completeStep(
      "Ranking cheapest options",
      `Compared ${options.length} exact flight options`
    );

    const summary = {
      request,
      departureDatePrices,
      returnDatePrices: [],
      cheapestOverall,
      cheapestRoundTrip: null,
      cheapestTwoOneWays: null,
      cheapestDirectThere,
      cheapestDirectReturn: null,
      cheapestMultiStop: findCheapestMultiStop(options),
      evaluatedDatePairs: candidateDates.map((entry) => ({
        departureDate: entry.date
      })),
      inspectedOptions: options.length,
      timingGuidance: null,
      priceAlert: null,
      hackerFareInsight: null
    };
    const annotatedSummary = this.timingGuidanceService.annotateSummary(summary);
    const supplementedSummary =
      await this.bookingSourceSupplementService.supplementSummary(
        annotatedSummary
      );
    tracker.finish(
      cheapestOverall
        ? `Cheapest option found for ${cheapestOverall.currency} ${cheapestOverall.totalPrice}`
        : "No one-way option matched the filters"
    );
    return supplementedSummary;
  }

  private async searchRoundTrip(
    request: SearchRequest,
    progressReporter?: SearchProgressReporter
  ): Promise<SearchSummary> {
    const targetPairCount = Math.max(request.maxResults * 2, 8);
    const tracker = new ProgressTracker(
      3 + targetPairCount * 3,
      progressReporter
    );

    tracker.setStage(
      "Scanning departure date range",
      "Looking for the cheapest outbound dates"
    );
    const departureDatePrices = await this.provider.searchOneWayWithinWindow(
      request,
      request.origin,
      request.destination,
      request.departureDateFrom,
      request.departureDateTo
    );
    tracker.completeStep(
      "Departure date range scanned",
      `Found ${departureDatePrices.length} departure date candidates`
    );

    tracker.setStage(
      "Scanning return date range",
      "Looking for the cheapest inbound dates"
    );
    const returnDatePrices = await this.provider.searchOneWayWithinWindow(
      request,
      request.destination,
      request.origin,
      request.returnDateFrom ?? request.departureDateFrom,
      request.returnDateTo ?? request.departureDateTo
    );
    tracker.completeStep(
      "Return date range scanned",
      `Found ${returnDatePrices.length} return date candidates`
    );

    const candidatePairs = this.buildCandidatePairs(
      departureDatePrices,
      returnDatePrices,
      request.maxResults,
      request.minimumTripDays ?? 0,
      request.maximumTripDays ?? 14
    );
    const totalExactLookups = candidatePairs.length * 3;
    tracker.setTotalSteps(
      3 + totalExactLookups,
      candidatePairs.length > 0
        ? `Inspecting ${candidatePairs.length} date combinations`
        : "No valid departure and return pairs matched the filters"
    );

    let completedLookups = 0;
    function reportExactLookupComplete(): void {
      completedLookups += 1;
      tracker.completeStep(
        "Checking exact flight options",
        `${completedLookups} of ${totalExactLookups} exact fare lookups finished`
      );
    }

    const evaluated = await mapWithConcurrency(
      candidatePairs,
      2,
      async (pair) => {
        const [roundTripOptions, outboundOptions, inboundOptions] =
          await Promise.all([
            this.provider
              .searchExactFlights({
              tripType: "round_trip",
              origin: request.origin,
              destination: request.destination,
              departureDate: pair.departureDate,
              returnDate: pair.returnDate,
              cabinClass: request.cabinClass,
              stopsFilter: request.stopsFilter,
              preferDirectBookingOnly: request.preferDirectBookingOnly,
              airlines: request.airlines,
              passengers: request.passengers,
              departureTimeWindow: request.departureTimeWindow ?? undefined,
              arrivalTimeWindow: request.arrivalTimeWindow ?? undefined
              })
              .then((result) => {
                reportExactLookupComplete();
                return result;
              }),
            this.provider
              .searchExactFlights({
              tripType: "one_way",
              origin: request.origin,
              destination: request.destination,
              departureDate: pair.departureDate,
              cabinClass: request.cabinClass,
              stopsFilter: request.stopsFilter,
              preferDirectBookingOnly: request.preferDirectBookingOnly,
              airlines: request.airlines,
              passengers: request.passengers,
              departureTimeWindow: request.departureTimeWindow ?? undefined,
              arrivalTimeWindow: request.arrivalTimeWindow ?? undefined
              })
              .then((result) => {
                reportExactLookupComplete();
                return result;
              }),
            this.provider
              .searchExactFlights({
              tripType: "one_way",
              origin: request.destination,
              destination: request.origin,
              departureDate: pair.returnDate ?? pair.departureDate,
              cabinClass: request.cabinClass,
              stopsFilter: request.stopsFilter,
              preferDirectBookingOnly: request.preferDirectBookingOnly,
              airlines: request.airlines,
              passengers: request.passengers,
              departureTimeWindow: request.departureTimeWindow ?? undefined,
              arrivalTimeWindow: request.arrivalTimeWindow ?? undefined
              })
              .then((result) => {
                reportExactLookupComplete();
                return result;
              })
          ]);

        const refinedRoundTripOptions =
          await this.refineOptionsForDirectBookingPreference(
            roundTripOptions,
            request
          );
        const refinedOutboundOptions =
          await this.refineOptionsForDirectBookingPreference(
            outboundOptions,
            this.buildOneWaySupplementRequest(
              request,
              request.origin,
              request.destination,
              pair.departureDate
            )
          );
        const refinedInboundOptions =
          await this.refineOptionsForDirectBookingPreference(
            inboundOptions,
            this.buildOneWaySupplementRequest(
              request,
              request.destination,
              request.origin,
              pair.returnDate ?? pair.departureDate
            )
          );

        const cheapestRoundTrip = findCheapest(refinedRoundTripOptions);
        const cheapestOutbound = findCheapest(refinedOutboundOptions);
        const cheapestInbound = findCheapest(refinedInboundOptions);
        const cheapestTwoOneWays =
          cheapestOutbound && cheapestInbound && pair.returnDate
            ? combineTwoOneWays(
                cheapestOutbound,
                cheapestInbound,
                pair.departureDate,
                pair.returnDate
              )
            : null;

        return {
          cheapestRoundTrip,
          cheapestTwoOneWays,
          cheapestDirectThere: findCheapestDirectThere(refinedOutboundOptions),
          cheapestDirectReturn: findCheapestDirectThere(refinedInboundOptions)
        };
      }
    );

    const roundTripOptions = evaluated
      .map((entry) => entry.cheapestRoundTrip)
      .filter((entry): entry is FlightOption => entry !== null);
    const twoOneWayOptions = evaluated
      .map((entry) => entry.cheapestTwoOneWays)
      .filter((entry): entry is FlightOption => entry !== null);
    const directThereOptions = evaluated
      .map((entry) => entry.cheapestDirectThere)
      .filter((entry): entry is FlightOption => entry !== null);
    const directReturnOptions = evaluated
      .map((entry) => entry.cheapestDirectReturn)
      .filter((entry): entry is FlightOption => entry !== null);

    const cheapestRoundTrip = findCheapest(roundTripOptions);
    const cheapestTwoOneWays = findCheapest(twoOneWayOptions);
    const cheapestDirectThere = findCheapest(directThereOptions);
    const cheapestDirectReturn = findCheapest(directReturnOptions);
    const cheapestOverall = findCheapest(
      [cheapestRoundTrip, cheapestTwoOneWays].filter(
        (entry): entry is FlightOption => entry !== null
      )
    );
    tracker.completeStep(
      "Ranking cheapest options",
      `Compared ${roundTripOptions.length + twoOneWayOptions.length} final option groups`
    );

    const summary = {
      request,
      departureDatePrices,
      returnDatePrices,
      cheapestOverall,
      cheapestRoundTrip,
      cheapestTwoOneWays,
      cheapestDirectThere,
      cheapestDirectReturn,
      cheapestMultiStop: findCheapestMultiStop([
        ...roundTripOptions,
        ...twoOneWayOptions
      ]),
      evaluatedDatePairs: candidatePairs,
      inspectedOptions: roundTripOptions.length + twoOneWayOptions.length,
      timingGuidance: null,
      priceAlert: null,
      hackerFareInsight: null
    };
    const annotatedSummary = this.timingGuidanceService.annotateSummary(summary);
    const supplementedSummary =
      await this.bookingSourceSupplementService.supplementSummary(
        annotatedSummary
      );
    tracker.finish(
      cheapestOverall
        ? `Cheapest option found for ${cheapestOverall.currency} ${cheapestOverall.totalPrice}`
        : "No round-trip option matched the filters"
    );
    return supplementedSummary;
  }

  private buildCandidatePairs(
    departureDatePrices: DatePrice[],
    returnDatePrices: DatePrice[],
    maxResults: number,
    minimumTripDays: number,
    maximumTripDays: number
  ): CandidatePair[] {
    const targetPairCount = Math.max(maxResults * 2, 8);
    const departures = departureDatePrices;
    const returns = returnDatePrices;
    const scoredPairs: ScoredCandidatePair[] = [];
    const seen = new Set<string>();

    for (const departure of departures) {
      for (const inbound of returns) {
        const tripLengthDays = differenceInDays(departure.date, inbound.date);
        if (
          tripLengthDays < minimumTripDays ||
          tripLengthDays > maximumTripDays
        ) {
          continue;
        }

        const key = `${departure.date}:${inbound.date}`;
        if (seen.has(key)) {
          continue;
        }

        seen.add(key);
        scoredPairs.push({
          departureDate: departure.date,
          returnDate: inbound.date,
          estimatedTotalPrice: departure.price + inbound.price
        });
      }
    }

    scoredPairs.sort((left, right) => {
      if (left.estimatedTotalPrice !== right.estimatedTotalPrice) {
        return left.estimatedTotalPrice - right.estimatedTotalPrice;
      }

      if (left.departureDate !== right.departureDate) {
        return left.departureDate.localeCompare(right.departureDate);
      }

      return (left.returnDate ?? "").localeCompare(right.returnDate ?? "");
    });

    return scoredPairs.slice(0, targetPairCount).map((pair) => ({
      departureDate: pair.departureDate,
      returnDate: pair.returnDate
    }));
  }

  private ensureReferenceDataExists(request: SearchRequest): void {
    if (!findAirportByCode(request.origin)) {
      throw new Error(`Unsupported origin airport code: ${request.origin}`);
    }

    if (!findAirportByCode(request.destination)) {
      throw new Error(
        `Unsupported destination airport code: ${request.destination}`
      );
    }

    for (const airlineCode of request.airlines) {
      if (!findAirlineByCode(airlineCode)) {
        throw new Error(`Unsupported airline code: ${airlineCode}`);
      }
    }
  }
}
