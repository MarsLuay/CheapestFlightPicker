import { BookingSourceSupplementService } from "./booking-source-supplement";
import { stableSerialize } from "./cache";
import { findAirlineByCode, findAirportByCode } from "./catalog";
import {
  createFlightSearchProvider,
  type FlightSearchProvider
} from "./search-provider";
import { TimingGuidanceService } from "./timing-guidance";
import {
  combineTwoOneWays,
  findCheapest,
  findCheapestNonstop,
  findCheapestMultiStop,
  isLikelyDirectAirlineBookingOption,
  mapWithConcurrency
} from "./utils";
import { createAmadeusMissingInfoSupplementProviderFromEnv } from "../providers/amadeus/missing-info-supplement";
import { searchRequestSchema } from "../shared/schemas";
import type {
  DatePrice,
  FlightOption,
  SearchProgress,
  SearchProgressPreview,
  SearchRequest,
  SearchResumeCheckpoint,
  SearchResumeOneWayResult,
  SearchResumeRoundTripResult,
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

function addDaysToIsoDate(date: string, days: number): string {
  const shiftedDate = new Date(new Date(date).getTime() + days * dayMs);
  return shiftedDate.toISOString().split("T")[0] ?? date;
}

type SearchProgressReporter = (progress: SearchProgress) => void;

type SearchRunOptions = {
  checkpointReporter?: (checkpoint: SearchResumeCheckpoint) => void;
  resumeCheckpoint?: SearchResumeCheckpoint | null;
};

function toPreviewSummary(
  summary: Pick<
    SearchSummary,
    | "departureDatePrices"
    | "returnDatePrices"
    | "cheapestOverall"
    | "cheapestRoundTrip"
    | "cheapestTwoOneWays"
    | "cheapestNonstop"
    | "cheapestMultiStop"
    | "evaluatedDatePairs"
    | "inspectedOptions"
  >
): SearchProgressPreview {
  return {
    departureDatePrices: summary.departureDatePrices,
    returnDatePrices: summary.returnDatePrices,
    cheapestOverall: summary.cheapestOverall,
    cheapestRoundTrip: summary.cheapestRoundTrip,
    cheapestTwoOneWays: summary.cheapestTwoOneWays,
    cheapestNonstop: summary.cheapestNonstop,
    cheapestMultiStop: summary.cheapestMultiStop,
    evaluatedDatePairs: summary.evaluatedDatePairs,
    inspectedOptions: summary.inspectedOptions
  };
}

function pairKey(pair: CandidatePair): string {
  return `${pair.departureDate}:${pair.returnDate ?? ""}`;
}

function searchRequestsMatch(left: SearchRequest, right: SearchRequest): boolean {
  return stableSerialize(left) === stableSerialize(right);
}

function getUsableResumeCheckpoint(
  checkpoint: SearchResumeCheckpoint | null | undefined,
  request: SearchRequest,
  tripType: SearchRequest["tripType"]
): SearchResumeCheckpoint | null {
  if (
    !checkpoint ||
    checkpoint.version !== 1 ||
    checkpoint.request.tripType !== tripType ||
    !searchRequestsMatch(checkpoint.request, request)
  ) {
    return null;
  }

  return checkpoint;
}

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return count === 1 ? singular : plural;
}

type DatePriceTimingDirection = "departure" | "return";

function getOptionSliceIndexForDatePrice(
  option: FlightOption,
  direction: DatePriceTimingDirection
): number {
  return direction === "return" && option.slices.length > 1 ? 1 : 0;
}

function getSliceDateTimes(
  option: FlightOption,
  direction: DatePriceTimingDirection
): Pick<DatePrice, "departureDateTime" | "arrivalDateTime"> {
  const slice = option.slices[getOptionSliceIndexForDatePrice(option, direction)];
  const legs = slice?.legs ?? [];

  return {
    departureDateTime: legs[0]?.departureDateTime,
    arrivalDateTime: legs[legs.length - 1]?.arrivalDateTime
  };
}

function annotateDatePricesWithBestOptionTimes(
  datePrices: DatePrice[],
  options: FlightOption[],
  direction: DatePriceTimingDirection
): DatePrice[] {
  const bestOptionByDate = new Map<string, FlightOption>();

  for (const option of options) {
    const date = direction === "return" ? option.returnDate : option.outboundDate;
    if (!date) {
      continue;
    }

    const currentBest = bestOptionByDate.get(date);
    if (!currentBest || option.totalPrice < currentBest.totalPrice) {
      bestOptionByDate.set(date, option);
    }
  }

  return datePrices.map((entry) => {
    const option = bestOptionByDate.get(entry.date);
    if (!option) {
      return entry;
    }

    const { departureDateTime, arrivalDateTime } = getSliceDateTimes(
      option,
      direction
    );
    if (!departureDateTime && !arrivalDateTime) {
      return entry;
    }

    return {
      ...entry,
      ...(departureDateTime ? { departureDateTime } : {}),
      ...(arrivalDateTime ? { arrivalDateTime } : {})
    };
  });
}

function buildOneWayCheckpointPreview(
  checkpoint: SearchResumeCheckpoint
): SearchProgressPreview | null {
  const oneWayResults = checkpoint.oneWayResults ?? [];
  if (checkpoint.departureDatePrices.length === 0 && oneWayResults.length === 0) {
    return null;
  }

  const options = oneWayResults.flatMap((result) => result.options);

  return toPreviewSummary({
    departureDatePrices: checkpoint.departureDatePrices,
    returnDatePrices: [],
    cheapestOverall: findCheapest(options),
    cheapestRoundTrip: null,
    cheapestTwoOneWays: null,
    cheapestNonstop: findCheapestNonstop(options),
    cheapestMultiStop: findCheapestMultiStop(options),
    evaluatedDatePairs: oneWayResults.map((result) => ({
      departureDate: result.departureDate
    })),
    inspectedOptions: options.length
  });
}

function buildRoundTripCheckpointPreview(
  checkpoint: SearchResumeCheckpoint
): SearchProgressPreview | null {
  const roundTripResults = checkpoint.roundTripResults ?? [];
  if (
    checkpoint.departureDatePrices.length === 0 &&
    checkpoint.returnDatePrices.length === 0 &&
    roundTripResults.length === 0
  ) {
    return null;
  }

  const roundTripOptions = roundTripResults
    .map((result) => result.cheapestRoundTrip)
    .filter((entry): entry is FlightOption => entry !== null);
  const twoOneWayOptions = roundTripResults
    .map((result) => result.cheapestTwoOneWays)
    .filter((entry): entry is FlightOption => entry !== null);
  const nonstopOptions = roundTripResults
    .map((result) => result.cheapestNonstop)
    .filter((entry): entry is FlightOption => entry !== null);

  return toPreviewSummary({
    departureDatePrices: checkpoint.departureDatePrices,
    returnDatePrices: checkpoint.returnDatePrices,
    cheapestOverall: findCheapest([...roundTripOptions, ...twoOneWayOptions]),
    cheapestRoundTrip: findCheapest(roundTripOptions),
    cheapestTwoOneWays: findCheapest(twoOneWayOptions),
    cheapestNonstop: findCheapest(nonstopOptions),
    cheapestMultiStop: findCheapestMultiStop([
      ...roundTripOptions,
      ...twoOneWayOptions
    ]),
    evaluatedDatePairs: roundTripResults.map((result) => ({
      departureDate: result.departureDate,
      returnDate: result.returnDate
    })),
    inspectedOptions: roundTripResults.reduce(
      (total, result) => total + result.inspectedOptions,
      0
    )
  });
}

function sortDatePricesByPrice(datePrices: DatePrice[]): DatePrice[] {
  return [...datePrices].sort((left, right) => {
    if (left.price !== right.price) {
      return left.price - right.price;
    }

    return left.date.localeCompare(right.date);
  });
}

function sortFlightOptionsByPrice(options: FlightOption[]): FlightOption[] {
  return [...options].sort((left, right) => {
    if (left.totalPrice !== right.totalPrice) {
      return left.totalPrice - right.totalPrice;
    }

    if ((left.outboundDate ?? "") !== (right.outboundDate ?? "")) {
      return (left.outboundDate ?? "").localeCompare(right.outboundDate ?? "");
    }

    return (left.returnDate ?? "").localeCompare(right.returnDate ?? "");
  });
}

function flightOptionsMatch(left: FlightOption, right: FlightOption): boolean {
  if (left.source !== right.source || left.slices.length !== right.slices.length) {
    return false;
  }

  return left.slices.every((leftSlice, sliceIndex) => {
    const rightSlice = right.slices[sliceIndex];
    if (
      !rightSlice ||
      leftSlice.stops !== rightSlice.stops ||
      leftSlice.legs.length !== rightSlice.legs.length
    ) {
      return false;
    }

    return leftSlice.legs.every((leftLeg, legIndex) => {
      const rightLeg = rightSlice.legs[legIndex];
      return (
        Boolean(rightLeg) &&
        leftLeg.airlineCode === rightLeg.airlineCode &&
        leftLeg.flightNumber === rightLeg.flightNumber &&
        leftLeg.departureAirportCode === rightLeg.departureAirportCode &&
        leftLeg.arrivalAirportCode === rightLeg.arrivalAirportCode &&
        leftLeg.departureDateTime === rightLeg.departureDateTime &&
        leftLeg.arrivalDateTime === rightLeg.arrivalDateTime
      );
    });
  });
}

class ProgressTracker {
  private completedSteps = 0;

  private currentDetail: string | undefined;

  private currentStage = "Preparing search";

  private previewCheapestOverall: FlightOption | null | undefined;

  private previewInspectedOptions: number | undefined;

  private previewSummary: SearchProgressPreview | null | undefined;

  constructor(
    private totalSteps: number,
    private readonly reporter?: SearchProgressReporter,
    initialState?: {
      completedSteps?: number;
      detail?: string;
      previewCheapestOverall?: FlightOption | null;
      previewInspectedOptions?: number;
      previewSummary?: SearchProgressPreview | null;
      stage?: string;
    }
  ) {
    this.totalSteps = Math.max(1, totalSteps);
    this.completedSteps = Math.max(
      0,
      Math.min(initialState?.completedSteps ?? 0, this.totalSteps)
    );
    this.currentStage = initialState?.stage ?? this.currentStage;
    this.currentDetail = initialState?.detail;
    this.previewCheapestOverall = initialState?.previewCheapestOverall;
    this.previewInspectedOptions = initialState?.previewInspectedOptions;
    this.previewSummary = initialState?.previewSummary;
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

  setCompletedSteps(completedSteps: number, stage: string, detail?: string): void {
    this.completedSteps = Math.max(0, Math.min(completedSteps, this.totalSteps));
    this.currentStage = stage;
    this.currentDetail = detail;
    this.emit();
  }

  setPreviewCheapestOverall(
    option: FlightOption | null,
    inspectedOptions?: number,
    emit = true
  ): void {
    this.previewCheapestOverall = option;
    this.previewInspectedOptions = inspectedOptions;
    if (emit) {
      this.emit();
    }
  }

  setPreviewSummary(summary: SearchProgressPreview | null, emit = true): void {
    this.previewSummary = summary;
    if (emit) {
      this.emit();
    }
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
      ),
      previewCheapestOverall: this.previewCheapestOverall,
      previewInspectedOptions: this.previewInspectedOptions,
      previewSummary: this.previewSummary
    });
  }
}

export class FlightSearchService {
  private readonly provider: FlightSearchProvider = createFlightSearchProvider();

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

  private buildSingleSliceOption(
    option: FlightOption,
    sliceIndex: number,
    departureDate: string
  ): FlightOption | null {
    const slice = option.slices[sliceIndex];
    if (!slice) {
      return null;
    }

    return {
      source: "google_one_way",
      totalPrice:
        option.slicePrices?.[sliceIndex] ??
        (sliceIndex === 0 ? option.totalPrice : option.totalPrice),
      currency: option.currency,
      slices: [slice],
      slicePrices:
        option.slicePrices?.[sliceIndex] !== undefined
          ? [option.slicePrices[sliceIndex] ?? 0]
          : undefined,
      bookingSource: option.bookingSource,
      outboundDate: departureDate
    };
  }

  private async repriceOneWayOption(
    request: SearchRequest,
    origin: string,
    destination: string,
    departureDate: string,
    target: FlightOption
  ): Promise<FlightOption | null> {
    const freshOptions = await this.provider.searchExactFlights(
      {
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
      },
      {
        bypassCache: true
      }
    );
    const refinedOptions = await this.refineOptionsForDirectBookingPreference(
      freshOptions,
      this.buildOneWaySupplementRequest(
        request,
        origin,
        destination,
        departureDate
      )
    );

    return (
      refinedOptions.find((candidate) => flightOptionsMatch(candidate, target)) ?? null
    );
  }

  private async repriceOption(
    request: SearchRequest,
    option: FlightOption | null
  ): Promise<FlightOption | null> {
    if (!option) {
      return null;
    }

    if (option.source === "google_one_way" && option.outboundDate) {
      return this.repriceOneWayOption(
        request,
        request.origin,
        request.destination,
        option.outboundDate,
        option
      );
    }

    if (
      option.source === "google_round_trip" &&
      option.outboundDate &&
      option.returnDate
    ) {
      const freshOptions = await this.provider.searchExactFlights(
        {
          tripType: "round_trip",
          origin: request.origin,
          destination: request.destination,
          departureDate: option.outboundDate,
          returnDate: option.returnDate,
          cabinClass: request.cabinClass,
          stopsFilter: request.stopsFilter,
          preferDirectBookingOnly: request.preferDirectBookingOnly,
          requireFreeCarryOnBag: request.requireFreeCarryOnBag,
          airlines: request.airlines,
          passengers: request.passengers,
          departureTimeWindow: request.departureTimeWindow ?? undefined,
          arrivalTimeWindow: request.arrivalTimeWindow ?? undefined
        },
        {
          bypassCache: true
        }
      );
      const refinedOptions = await this.refineOptionsForDirectBookingPreference(
        freshOptions,
        request
      );

      return (
        refinedOptions.find((candidate) => flightOptionsMatch(candidate, option)) ??
        null
      );
    }

    if (
      option.source === "two_one_way_combo" &&
      option.outboundDate &&
      option.returnDate
    ) {
      const outboundTarget = this.buildSingleSliceOption(
        option,
        0,
        option.outboundDate
      );
      const inboundTarget = this.buildSingleSliceOption(
        option,
        1,
        option.returnDate
      );

      if (!outboundTarget || !inboundTarget) {
        return null;
      }

      const [repricedOutbound, repricedInbound] = await Promise.all([
        this.repriceOneWayOption(
          request,
          request.origin,
          request.destination,
          option.outboundDate,
          outboundTarget
        ),
        this.repriceOneWayOption(
          request,
          request.destination,
          request.origin,
          option.returnDate,
          inboundTarget
        )
      ]);

      if (!repricedOutbound || !repricedInbound) {
        return null;
      }

      return combineTwoOneWays(
        repricedOutbound,
        repricedInbound,
        option.outboundDate,
        option.returnDate
      );
    }

    return null;
  }

  private replaceMatchingOption(
    options: FlightOption[],
    target: FlightOption | null,
    replacement: FlightOption | null
  ): FlightOption[] {
    if (!target) {
      return options;
    }

    const matchingIndexByIdentity = options.findIndex((option) => option === target);
    const matchingIndex =
      matchingIndexByIdentity >= 0
        ? matchingIndexByIdentity
        : options.findIndex((option) => flightOptionsMatch(option, target));

    if (matchingIndex < 0) {
      return options;
    }

    if (!replacement) {
      return options.filter((_, index) => index !== matchingIndex);
    }

    return options.map((option, index) =>
      index === matchingIndex ? replacement : option
    );
  }

  async search(
    input: unknown,
    progressReporter?: SearchProgressReporter,
    options?: SearchRunOptions
  ): Promise<SearchSummary> {
    const request = searchRequestSchema.parse(input);
    this.ensureReferenceDataExists(request);

    if (request.tripType === "one_way") {
      return this.searchOneWay(request, progressReporter, options);
    }

    return this.searchRoundTrip(request, progressReporter, options);
  }

  private async searchOneWay(
    request: SearchRequest,
    progressReporter?: SearchProgressReporter,
    options?: SearchRunOptions
  ): Promise<SearchSummary> {
    const candidateDepth = Math.max(request.maxResults, 5);
    const resumeCheckpoint = getUsableResumeCheckpoint(
      options?.resumeCheckpoint,
      request,
      "one_way"
    );
    const resumedDepartureDatePrices =
      resumeCheckpoint && resumeCheckpoint.departureDatePrices.length > 0
        ? sortDatePricesByPrice(resumeCheckpoint.departureDatePrices)
        : null;
    const resumedResultByDate = new Map(
      (resumeCheckpoint?.oneWayResults ?? []).map((result) => [
        result.departureDate,
        result
      ] as const)
    );
    const resumedCandidateDates =
      resumedDepartureDatePrices?.slice(0, candidateDepth) ?? [];
    const initialCompletedLookups = resumedCandidateDates.filter((entry) =>
      resumedResultByDate.has(entry.date)
    ).length;
    const resumePreview = resumeCheckpoint
      ? buildOneWayCheckpointPreview(resumeCheckpoint)
      : null;
    const tracker = new ProgressTracker(
      2 + (resumedDepartureDatePrices ? resumedCandidateDates.length : candidateDepth),
      progressReporter,
      resumeCheckpoint
        ? {
            completedSteps:
              (resumedDepartureDatePrices ? 1 : 0) + initialCompletedLookups,
            detail:
              initialCompletedLookups > 0
                ? `Skipping ${initialCompletedLookups} already checked ${pluralize(
                    initialCompletedLookups,
                    "date"
                  )}`
                : "Loading saved search progress",
            previewCheapestOverall: resumePreview?.cheapestOverall ?? undefined,
            previewInspectedOptions: resumePreview?.inspectedOptions,
            previewSummary: resumePreview,
            stage: "Resuming search"
          }
        : undefined
    );

    let departureDatePrices: DatePrice[];
    const completedResults: SearchResumeOneWayResult[] = [];

    const reportCheckpoint = () => {
      options?.checkpointReporter?.({
        version: 1,
        request,
        departureDatePrices,
        returnDatePrices: [],
        oneWayResults: [...completedResults]
      });
    };

    if (resumedDepartureDatePrices) {
      departureDatePrices = resumedDepartureDatePrices;
      tracker.setStage(
        "Resuming search",
        `Reusing ${departureDatePrices.length} departure date ${pluralize(
          departureDatePrices.length,
          "candidate"
        )} from the interrupted search`
      );
    } else {
      tracker.setStage(
        "Scanning departure date range",
        "Looking for the cheapest outbound dates"
      );
      departureDatePrices = sortDatePricesByPrice(
        await this.provider.searchOneWayWithinWindow(
          request,
          request.origin,
          request.destination,
          request.departureDateFrom,
          request.departureDateTo
        )
      );
      tracker.completeStep(
        "Departure date range scanned",
        `Found ${departureDatePrices.length} departure date candidates`
      );
      reportCheckpoint();
    }

    tracker.setPreviewSummary(
      toPreviewSummary({
        departureDatePrices,
        returnDatePrices: [],
        cheapestOverall: null,
        cheapestRoundTrip: null,
        cheapestTwoOneWays: null,
        cheapestNonstop: null,
        cheapestMultiStop: null,
        evaluatedDatePairs: [],
        inspectedOptions: 0
      }),
      false
    );

    const candidateDates = departureDatePrices.slice(0, candidateDepth);
    tracker.setTotalSteps(
      2 + candidateDates.length,
      `Inspecting ${candidateDates.length} exact flight searches`
    );

    const optionsByDate: FlightOption[][] = Array.from({
      length: candidateDates.length
    });
    const previewOptions: FlightOption[] = [];
    const previewEvaluatedDatePairs: CandidatePair[] = [];
    let completedLookups = 0;

    for (const [index, entry] of candidateDates.entries()) {
      const resumedResult = resumedResultByDate.get(entry.date);
      if (!resumedResult) {
        continue;
      }

      optionsByDate[index] = resumedResult.options;
      completedResults.push({
        departureDate: resumedResult.departureDate,
        options: resumedResult.options
      });
      previewOptions.push(...resumedResult.options);
      previewEvaluatedDatePairs.push({
        departureDate: entry.date
      });
      completedLookups += 1;
    }

    if (completedLookups > 0) {
      const previewCheapestOverall = findCheapest(previewOptions);
      tracker.setPreviewSummary(
        toPreviewSummary({
          departureDatePrices,
          returnDatePrices: [],
          cheapestOverall: previewCheapestOverall,
          cheapestRoundTrip: null,
          cheapestTwoOneWays: null,
          cheapestNonstop: findCheapestNonstop(previewOptions),
          cheapestMultiStop: findCheapestMultiStop(previewOptions),
          evaluatedDatePairs: [...previewEvaluatedDatePairs],
          inspectedOptions: previewOptions.length
        }),
        false
      );
      tracker.setPreviewCheapestOverall(
        previewCheapestOverall,
        completedLookups,
        false
      );
      tracker.setCompletedSteps(
        1 + completedLookups,
        "Checking exact flight options",
        `Resumed ${completedLookups} of ${candidateDates.length} exact fare lookups`
      );
    }
    reportCheckpoint();

    await mapWithConcurrency(
      candidateDates
        .map((entry, index) => ({ entry, index }))
        .filter(({ entry }) => !resumedResultByDate.has(entry.date)),
      2,
      async ({ entry, index }) => {
        const options = await this.provider.searchExactFlights({
          tripType: "one_way",
          origin: request.origin,
          destination: request.destination,
          departureDate: entry.date,
          cabinClass: request.cabinClass,
          stopsFilter: request.stopsFilter,
          preferDirectBookingOnly: request.preferDirectBookingOnly,
          requireFreeCarryOnBag: request.requireFreeCarryOnBag,
          airlines: request.airlines,
          passengers: request.passengers,
          departureTimeWindow: request.departureTimeWindow ?? undefined,
          arrivalTimeWindow: request.arrivalTimeWindow ?? undefined
        });
        optionsByDate[index] = options;
        previewOptions.push(...options);
        previewEvaluatedDatePairs.push({
          departureDate: entry.date
        });
        const previewCheapestOverall = findCheapest(previewOptions);
        completedLookups += 1;
        tracker.setPreviewSummary(
          toPreviewSummary({
            departureDatePrices,
            returnDatePrices: [],
            cheapestOverall: previewCheapestOverall,
            cheapestRoundTrip: null,
            cheapestTwoOneWays: null,
            cheapestNonstop: findCheapestNonstop(previewOptions),
            cheapestMultiStop: findCheapestMultiStop(previewOptions),
            evaluatedDatePairs: [...previewEvaluatedDatePairs],
            inspectedOptions: previewOptions.length
          }),
          false
        );
        tracker.setPreviewCheapestOverall(
          previewCheapestOverall,
          completedLookups,
          false
        );
        tracker.completeStep(
          "Checking exact flight options",
          `${completedLookups} of ${candidateDates.length} exact fare lookups finished`
        );
        completedResults.push({
          departureDate: entry.date,
          options
        });
        reportCheckpoint();
        return options;
      }
    );

    let exactSearchOptions = optionsByDate.flat();
    exactSearchOptions = await this.refineOptionsForDirectBookingPreference(
      exactSearchOptions,
      request
    );
    const inspectedOptions = exactSearchOptions.length;
    let searchOptions = sortFlightOptionsByPrice(exactSearchOptions).slice(
      0,
      request.maxResults * 4
    );
    let cheapestOverall = findCheapest(searchOptions);
    if (cheapestOverall) {
      tracker.setStage(
        "Refreshing best fare",
        "Repricing the current cheapest itinerary before the timing read"
      );
      const repricedCheapestOverall = await this.repriceOption(
        request,
        cheapestOverall
      );
      exactSearchOptions = this.replaceMatchingOption(
        exactSearchOptions,
        cheapestOverall,
        repricedCheapestOverall
      );
      searchOptions = this.replaceMatchingOption(
        searchOptions,
        cheapestOverall,
        repricedCheapestOverall
      );
      cheapestOverall = findCheapest(searchOptions);
    }
    departureDatePrices = annotateDatePricesWithBestOptionTimes(
      departureDatePrices,
      exactSearchOptions,
      "departure"
    );
    const cheapestNonstop = findCheapestNonstop(searchOptions);
    tracker.setPreviewSummary(
      toPreviewSummary({
        departureDatePrices,
        returnDatePrices: [],
        cheapestOverall,
        cheapestRoundTrip: null,
        cheapestTwoOneWays: null,
        cheapestNonstop,
        cheapestMultiStop: findCheapestMultiStop(searchOptions),
        evaluatedDatePairs: candidateDates.map((entry) => ({
          departureDate: entry.date
        })),
        inspectedOptions
      }),
      false
    );
    tracker.setPreviewCheapestOverall(cheapestOverall, completedLookups, false);
    tracker.completeStep(
      "Ranking cheapest options",
      `Compared ${inspectedOptions} qualifying exact flight options`
    );

    const summary = {
      request,
      departureDatePrices,
      returnDatePrices: [],
      cheapestOverall,
      cheapestRoundTrip: null,
      cheapestTwoOneWays: null,
      cheapestNonstop,
      cheapestMultiStop: findCheapestMultiStop(searchOptions),
      evaluatedDatePairs: candidateDates.map((entry) => ({
        departureDate: entry.date
      })),
      inspectedOptions,
      timingGuidance: null,
      priceAlert: null,
      hackerFareInsight: null
    };
    const annotatedSummary = await this.timingGuidanceService.annotateSummary(
      summary,
      searchOptions
    );
    const supplementedSummary =
      await this.bookingSourceSupplementService.supplementSummary(
        annotatedSummary
      );
    tracker.setPreviewSummary(toPreviewSummary(supplementedSummary), false);
    tracker.setPreviewCheapestOverall(
      supplementedSummary.cheapestOverall,
      completedLookups,
      false
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
    progressReporter?: SearchProgressReporter,
    options?: SearchRunOptions
  ): Promise<SearchSummary> {
    const targetPairCount = Math.max(request.maxResults * 2, 8);
    const resumeCheckpoint = getUsableResumeCheckpoint(
      options?.resumeCheckpoint,
      request,
      "round_trip"
    );
    const resumedDepartureDatePrices =
      resumeCheckpoint && resumeCheckpoint.departureDatePrices.length > 0
        ? sortDatePricesByPrice(resumeCheckpoint.departureDatePrices)
        : null;
    const resumedReturnDatePrices =
      resumeCheckpoint && resumeCheckpoint.returnDatePrices.length > 0
        ? sortDatePricesByPrice(resumeCheckpoint.returnDatePrices)
        : null;
    const resumedResultByPair = new Map(
      (resumeCheckpoint?.roundTripResults ?? []).map((result) => [
        pairKey(result),
        result
      ] as const)
    );
    const resumedCandidatePairs =
      resumedDepartureDatePrices && resumedReturnDatePrices
        ? this.buildCandidatePairs(
            request,
            resumedDepartureDatePrices,
            resumedReturnDatePrices,
            request.maxResults,
            request.minimumTripDays ?? 0,
            request.maximumTripDays ?? 14
          )
        : [];
    const initialCompletedPairs = resumedCandidatePairs.filter((pair) =>
      resumedResultByPair.has(pairKey(pair))
    ).length;
    const resumePreview = resumeCheckpoint
      ? buildRoundTripCheckpointPreview(resumeCheckpoint)
      : null;
    const tracker = new ProgressTracker(
      3 +
        (resumedDepartureDatePrices && resumedReturnDatePrices
          ? resumedCandidatePairs.length * 3
          : targetPairCount * 3),
      progressReporter,
      resumeCheckpoint
        ? {
            completedSteps:
              (resumedDepartureDatePrices ? 1 : 0) +
              (resumedReturnDatePrices ? 1 : 0) +
              initialCompletedPairs * 3,
            detail:
              initialCompletedPairs > 0
                ? `Skipping ${initialCompletedPairs} already checked date ${pluralize(
                    initialCompletedPairs,
                    "combination"
                  )}`
                : "Loading saved search progress",
            previewCheapestOverall: resumePreview?.cheapestOverall ?? undefined,
            previewInspectedOptions: resumePreview?.inspectedOptions,
            previewSummary: resumePreview,
            stage: "Resuming search"
          }
        : undefined
    );

    let departureDatePrices: DatePrice[];
    let returnDatePrices: DatePrice[] = [];
    const completedRoundTripResults: SearchResumeRoundTripResult[] = [];

    const reportCheckpoint = () => {
      options?.checkpointReporter?.({
        version: 1,
        request,
        departureDatePrices,
        returnDatePrices,
        roundTripResults: [...completedRoundTripResults]
      });
    };

    if (resumedDepartureDatePrices) {
      departureDatePrices = resumedDepartureDatePrices;
      tracker.setStage(
        "Resuming search",
        `Reusing ${departureDatePrices.length} departure date ${pluralize(
          departureDatePrices.length,
          "candidate"
        )} from the interrupted search`
      );
    } else {
      tracker.setStage(
        "Scanning departure date range",
        "Looking for the cheapest outbound dates"
      );
      departureDatePrices = sortDatePricesByPrice(
        await this.provider.searchOneWayWithinWindow(
          request,
          request.origin,
          request.destination,
          request.departureDateFrom,
          request.departureDateTo
        )
      );
      tracker.completeStep(
        "Departure date range scanned",
        `Found ${departureDatePrices.length} departure date candidates`
      );
      reportCheckpoint();
    }
    tracker.setPreviewSummary(
      toPreviewSummary({
        departureDatePrices,
        returnDatePrices: [],
        cheapestOverall: null,
        cheapestRoundTrip: null,
        cheapestTwoOneWays: null,
        cheapestNonstop: null,
        cheapestMultiStop: null,
        evaluatedDatePairs: [],
        inspectedOptions: 0
      }),
      false
    );

    if (resumedReturnDatePrices) {
      returnDatePrices = resumedReturnDatePrices;
      tracker.setStage(
        "Resuming search",
        `Reusing ${returnDatePrices.length} return date ${pluralize(
          returnDatePrices.length,
          "candidate"
        )} from the interrupted search`
      );
    } else {
      tracker.setStage(
        "Scanning return date range",
        "Looking for the cheapest inbound dates"
      );
      returnDatePrices = sortDatePricesByPrice(
        await this.provider.searchOneWayWithinWindow(
          request,
          request.destination,
          request.origin,
          request.returnDateFrom ?? request.departureDateFrom,
          request.returnDateTo ?? request.departureDateTo
        )
      );
      tracker.completeStep(
        "Return date range scanned",
        `Found ${returnDatePrices.length} return date candidates`
      );
      reportCheckpoint();
    }
    tracker.setPreviewSummary(
      toPreviewSummary({
        departureDatePrices,
        returnDatePrices,
        cheapestOverall: null,
        cheapestRoundTrip: null,
        cheapestTwoOneWays: null,
        cheapestNonstop: null,
        cheapestMultiStop: null,
        evaluatedDatePairs: [],
        inspectedOptions: 0
      }),
      false
    );

    const candidatePairs = this.buildCandidatePairs(
      request,
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
    let completedPairEvaluations = 0;
    let previewInspectedOptions = 0;
    const previewRoundTripOptions: FlightOption[] = [];
    const previewTwoOneWayOptions: FlightOption[] = [];
    const previewNonstopOptions: FlightOption[] = [];
    const previewEvaluatedDatePairs: CandidatePair[] = [];
    const evaluatedByPair = new Map<string, SearchResumeRoundTripResult>();

    function applyRoundTripResult(result: SearchResumeRoundTripResult): void {
      evaluatedByPair.set(pairKey(result), result);
      completedRoundTripResults.push(result);
      if (result.cheapestRoundTrip) {
        previewRoundTripOptions.push(result.cheapestRoundTrip);
      }
      if (result.cheapestTwoOneWays) {
        previewTwoOneWayOptions.push(result.cheapestTwoOneWays);
      }
      if (result.cheapestNonstop) {
        previewNonstopOptions.push(result.cheapestNonstop);
      }
      previewEvaluatedDatePairs.push({
        departureDate: result.departureDate,
        returnDate: result.returnDate
      });
      previewInspectedOptions += result.inspectedOptions;
      completedPairEvaluations += 1;
    }

    for (const pair of candidatePairs) {
      const resumedResult = resumedResultByPair.get(pairKey(pair));
      if (!resumedResult) {
        continue;
      }

      completedLookups += 3;
      applyRoundTripResult(resumedResult);
    }

    if (completedPairEvaluations > 0) {
      const previewCheapestOverall = findCheapest([
        ...previewRoundTripOptions,
        ...previewTwoOneWayOptions
      ]);
      tracker.setPreviewSummary(
        toPreviewSummary({
          departureDatePrices,
          returnDatePrices,
          cheapestOverall: previewCheapestOverall,
          cheapestRoundTrip: findCheapest(previewRoundTripOptions),
          cheapestTwoOneWays: findCheapest(previewTwoOneWayOptions),
          cheapestNonstop: findCheapest(previewNonstopOptions),
          cheapestMultiStop: findCheapestMultiStop([
            ...previewRoundTripOptions,
            ...previewTwoOneWayOptions
          ]),
          evaluatedDatePairs: [...previewEvaluatedDatePairs],
          inspectedOptions: previewInspectedOptions
        }),
        false
      );
      tracker.setPreviewCheapestOverall(
        previewCheapestOverall,
        completedPairEvaluations,
        false
      );
      tracker.setCompletedSteps(
        2 + completedLookups,
        "Checking exact flight options",
        `Resumed ${completedPairEvaluations} of ${candidatePairs.length} date combinations`
      );
    }
    reportCheckpoint();

    function reportExactLookupComplete(): void {
      completedLookups += 1;
      tracker.completeStep(
        "Checking exact flight options",
        `${completedLookups} of ${totalExactLookups} exact fare lookups finished`
      );
    }

    async function evaluateCandidatePair(
      pair: CandidatePair,
      service: FlightSearchService
    ): Promise<SearchResumeRoundTripResult> {
      const [roundTripOptions, outboundOptions, inboundOptions] =
        await Promise.all([
          service.provider
            .searchExactFlights({
              tripType: "round_trip",
              origin: request.origin,
              destination: request.destination,
              departureDate: pair.departureDate,
              returnDate: pair.returnDate,
              cabinClass: request.cabinClass,
              stopsFilter: request.stopsFilter,
              preferDirectBookingOnly: request.preferDirectBookingOnly,
              requireFreeCarryOnBag: request.requireFreeCarryOnBag,
              airlines: request.airlines,
              passengers: request.passengers,
              departureTimeWindow: request.departureTimeWindow ?? undefined,
              arrivalTimeWindow: request.arrivalTimeWindow ?? undefined
            })
            .then((result) => {
              reportExactLookupComplete();
              return result;
            }),
          service.provider
            .searchExactFlights({
              tripType: "one_way",
              origin: request.origin,
              destination: request.destination,
              departureDate: pair.departureDate,
              cabinClass: request.cabinClass,
              stopsFilter: request.stopsFilter,
              preferDirectBookingOnly: request.preferDirectBookingOnly,
              requireFreeCarryOnBag: request.requireFreeCarryOnBag,
              airlines: request.airlines,
              passengers: request.passengers,
              departureTimeWindow: request.departureTimeWindow ?? undefined,
              arrivalTimeWindow: request.arrivalTimeWindow ?? undefined
            })
            .then((result) => {
              reportExactLookupComplete();
              return result;
            }),
          service.provider
            .searchExactFlights({
              tripType: "one_way",
              origin: request.destination,
              destination: request.origin,
              departureDate: pair.returnDate ?? pair.departureDate,
              cabinClass: request.cabinClass,
              stopsFilter: request.stopsFilter,
              preferDirectBookingOnly: request.preferDirectBookingOnly,
              requireFreeCarryOnBag: request.requireFreeCarryOnBag,
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
        await service.refineOptionsForDirectBookingPreference(
          roundTripOptions,
          request
        );
      const refinedOutboundOptions =
        await service.refineOptionsForDirectBookingPreference(
          outboundOptions,
          service.buildOneWaySupplementRequest(
            request,
            request.origin,
            request.destination,
            pair.departureDate
          )
        );
      const refinedInboundOptions =
        await service.refineOptionsForDirectBookingPreference(
          inboundOptions,
          service.buildOneWaySupplementRequest(
            request,
            request.destination,
            request.origin,
            pair.returnDate ?? pair.departureDate
          )
        );
      const inspectedOptionsForPair =
        refinedRoundTripOptions.length +
        refinedOutboundOptions.length +
        refinedInboundOptions.length;

      const cheapestRoundTrip = findCheapest(refinedRoundTripOptions);
      const cheapestNonstopRoundTrip = findCheapestNonstop(
        refinedRoundTripOptions
      );
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
      const cheapestNonstopOutbound = findCheapestNonstop(
        refinedOutboundOptions
      );
      const cheapestNonstopInbound = findCheapestNonstop(refinedInboundOptions);
      const cheapestNonstopTwoOneWays =
        cheapestNonstopOutbound && cheapestNonstopInbound && pair.returnDate
          ? combineTwoOneWays(
              cheapestNonstopOutbound,
              cheapestNonstopInbound,
              pair.departureDate,
              pair.returnDate
            )
          : null;
      const cheapestNonstop = findCheapest(
        [cheapestNonstopRoundTrip, cheapestNonstopTwoOneWays].filter(
          (entry): entry is FlightOption => entry !== null
        )
      );

      return {
        departureDate: pair.departureDate,
        returnDate: pair.returnDate,
        cheapestRoundTrip,
        cheapestTwoOneWays,
        cheapestNonstop,
        inspectedOptions: inspectedOptionsForPair
      };
    }

    await mapWithConcurrency(
      candidatePairs.filter((pair) => !resumedResultByPair.has(pairKey(pair))),
      2,
      async (pair) => {
        const result = await evaluateCandidatePair(pair, this);
        applyRoundTripResult(result);
        const previewCheapestOverall = findCheapest([
          ...previewRoundTripOptions,
          ...previewTwoOneWayOptions
        ]);
        tracker.setPreviewSummary(
          toPreviewSummary({
            departureDatePrices,
            returnDatePrices,
            cheapestOverall: previewCheapestOverall,
            cheapestRoundTrip: findCheapest(previewRoundTripOptions),
            cheapestTwoOneWays: findCheapest(previewTwoOneWayOptions),
            cheapestNonstop: findCheapest(previewNonstopOptions),
            cheapestMultiStop: findCheapestMultiStop([
              ...previewRoundTripOptions,
              ...previewTwoOneWayOptions
            ]),
            evaluatedDatePairs: [...previewEvaluatedDatePairs],
            inspectedOptions: previewInspectedOptions
          }),
          false
        );
        tracker.setPreviewCheapestOverall(
          previewCheapestOverall,
          completedPairEvaluations
        );
        reportCheckpoint();
        return result;
      }
    );

    const evaluated = candidatePairs
      .map((pair) => evaluatedByPair.get(pairKey(pair)))
      .filter((entry): entry is SearchResumeRoundTripResult => Boolean(entry));

    let roundTripOptions = evaluated
      .map((entry) => entry.cheapestRoundTrip)
      .filter((entry): entry is FlightOption => entry !== null);
    let twoOneWayOptions = evaluated
      .map((entry) => entry.cheapestTwoOneWays)
      .filter((entry): entry is FlightOption => entry !== null);
    let nonstopOptions = evaluated
      .map((entry) => entry.cheapestNonstop)
      .filter((entry): entry is FlightOption => entry !== null);
    const inspectedOptions = evaluated.reduce(
      (total, entry) => total + entry.inspectedOptions,
      0
    );
    let cheapestRoundTrip = findCheapest(roundTripOptions);
    let cheapestTwoOneWays = findCheapest(twoOneWayOptions);
    let cheapestOverall = findCheapest(
      [cheapestRoundTrip, cheapestTwoOneWays].filter(
        (entry): entry is FlightOption => entry !== null
      )
    );

    if (cheapestOverall) {
      tracker.setStage(
        "Refreshing best fare",
        "Repricing the current cheapest itinerary before the timing read"
      );
      const repricedCheapestOverall = await this.repriceOption(
        request,
        cheapestOverall
      );

      if (cheapestOverall.source === "google_round_trip") {
        roundTripOptions = this.replaceMatchingOption(
          roundTripOptions,
          cheapestOverall,
          repricedCheapestOverall
        );
        nonstopOptions = this.replaceMatchingOption(
          nonstopOptions,
          cheapestOverall,
          repricedCheapestOverall
        );
      } else if (cheapestOverall.source === "two_one_way_combo") {
        twoOneWayOptions = this.replaceMatchingOption(
          twoOneWayOptions,
          cheapestOverall,
          repricedCheapestOverall
        );
        nonstopOptions = this.replaceMatchingOption(
          nonstopOptions,
          cheapestOverall,
          repricedCheapestOverall
        );
      }

      cheapestRoundTrip = findCheapest(roundTripOptions);
      cheapestTwoOneWays = findCheapest(twoOneWayOptions);
      cheapestOverall = findCheapest(
        [cheapestRoundTrip, cheapestTwoOneWays].filter(
          (entry): entry is FlightOption => entry !== null
        )
      );
    }

    const exactDateTimingOptions = [...roundTripOptions, ...twoOneWayOptions];
    departureDatePrices = annotateDatePricesWithBestOptionTimes(
      departureDatePrices,
      exactDateTimingOptions,
      "departure"
    );
    returnDatePrices = annotateDatePricesWithBestOptionTimes(
      returnDatePrices,
      exactDateTimingOptions,
      "return"
    );
    const cheapestNonstop = findCheapest(nonstopOptions);
    tracker.setPreviewSummary(
      toPreviewSummary({
        departureDatePrices,
        returnDatePrices,
        cheapestOverall,
        cheapestRoundTrip,
        cheapestTwoOneWays,
        cheapestNonstop,
        cheapestMultiStop: findCheapestMultiStop([
          ...roundTripOptions,
          ...twoOneWayOptions
        ]),
        evaluatedDatePairs: candidatePairs,
        inspectedOptions
      }),
      false
    );
    tracker.setPreviewCheapestOverall(cheapestOverall, completedPairEvaluations, false);
    tracker.completeStep(
      "Ranking cheapest options",
      `Compared ${inspectedOptions} qualifying fares across ${candidatePairs.length} date combinations`
    );

    const summary = {
      request,
      departureDatePrices,
      returnDatePrices,
      cheapestOverall,
      cheapestRoundTrip,
      cheapestTwoOneWays,
      cheapestNonstop,
      cheapestMultiStop: findCheapestMultiStop([
        ...roundTripOptions,
        ...twoOneWayOptions
      ]),
      evaluatedDatePairs: candidatePairs,
      inspectedOptions,
      timingGuidance: null,
      priceAlert: null,
      hackerFareInsight: null
    };
    const annotatedSummary = await this.timingGuidanceService.annotateSummary(
      summary,
      [...roundTripOptions, ...twoOneWayOptions]
    );
    const supplementedSummary =
      await this.bookingSourceSupplementService.supplementSummary(
        annotatedSummary
      );
    tracker.setPreviewSummary(toPreviewSummary(supplementedSummary), false);
    tracker.setPreviewCheapestOverall(
      supplementedSummary.cheapestOverall,
      completedPairEvaluations,
      false
    );
    tracker.finish(
      cheapestOverall
        ? `Cheapest option found for ${cheapestOverall.currency} ${cheapestOverall.totalPrice}`
        : "No round-trip option matched the filters"
    );
    return supplementedSummary;
  }

  private buildCandidatePairs(
    request: SearchRequest,
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

    if (
      request.useExactDates &&
      request.tripType === "round_trip" &&
      request.returnDateFrom
    ) {
      const returnPriceByDate = new Map(
        returns.map((entry) => [entry.date, entry.price] as const)
      );

      for (const departure of departures) {
        const departureOffset = differenceInDays(
          request.departureDateFrom,
          departure.date
        );
        const matchedReturnDate = addDaysToIsoDate(
          request.returnDateFrom,
          departureOffset
        );
        const matchedReturnPrice = returnPriceByDate.get(matchedReturnDate);

        if (matchedReturnPrice === undefined) {
          continue;
        }

        const key = `${departure.date}:${matchedReturnDate}`;
        if (seen.has(key)) {
          continue;
        }

        seen.add(key);
        scoredPairs.push({
          departureDate: departure.date,
          returnDate: matchedReturnDate,
          estimatedTotalPrice: departure.price + matchedReturnPrice
        });
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
