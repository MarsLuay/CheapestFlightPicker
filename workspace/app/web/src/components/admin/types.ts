export type AdminPanelProps = {
  uiSnapshot?: Record<string, unknown>;
};

export type AdminUiSnapshot = {
  route?: {
    tripType?: string;
    origin?: string;
    destination?: string;
    destinationState?: string;
    useExactDates?: boolean;
    searchIntelligence?: number;
  };
  dateRanges?: {
    departureDateFrom?: string;
    departureDateTo?: string;
    departureRangeValid?: boolean;
    returnDateFrom?: string | null;
    returnDateTo?: string | null;
    returnRangeValid?: boolean;
    returnDatesMatchDepartureRange?: boolean;
    minimumTripDays?: number;
    maximumTripDays?: number;
  };
  locationDetection?: {
    status?: string;
    selectionSource?: string;
    appliedOrigin?: string;
    inferredAirport?: string | null;
    browserTimeZone?: string | null;
    matchedRegion?: string | null;
    fallbackOrigin?: string;
    message?: string;
  };
  searchState?: {
    isSearching?: boolean;
    hasCompletedSearch?: boolean;
    latestError?: string | null;
    progress?: {
      stage?: string;
      detail?: string | null;
      percent?: number;
    } | null;
  };
  latestSummary?: {
    inspectedOptions?: number;
    evaluatedDatePairs?: number;
    departureDateCandidates?: number;
    returnDateCandidates?: number;
    cheapestOverall?: {
      price?: string;
      source?: string;
      bookingSource?: string;
    } | null;
    cheapestRoundTrip?: string | null;
    cheapestTwoOneWays?: string | null;
    timingGuidance?: {
      recommendation?: string;
      confidence?: string;
      trend?: string;
      pricePosition?: string;
      historySampleSize?: number;
      summary?: string;
    } | null;
    priceAlert?: {
      kind?: string;
      changePercent?: number;
      summary?: string;
    } | null;
    separateOneWayInsight?: {
      summary?: string;
    } | null;
  } | null;
};
