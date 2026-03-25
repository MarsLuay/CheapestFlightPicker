import type { SearchRequest } from "./types";

function syncLatestDateToEarliest(
  earliestDate: string,
  latestDate?: string
): string | undefined {
  if (!earliestDate || !latestDate) {
    return latestDate;
  }

  return earliestDate > latestDate ? earliestDate : latestDate;
}

function shouldSyncExactDates(
  request: SearchRequest,
  useExactDates: boolean
): boolean {
  return useExactDates && request.tripType === "round_trip";
}

export function withDepartureDateFrom(
  request: SearchRequest,
  nextDepartureDateFrom: string,
  useExactDates: boolean
): SearchRequest {
  const departureDateTo =
    syncLatestDateToEarliest(nextDepartureDateFrom, request.departureDateTo) ??
    request.departureDateTo;

  if (shouldSyncExactDates(request, useExactDates)) {
    return {
      ...request,
      departureDateFrom: nextDepartureDateFrom,
      departureDateTo,
      returnDateFrom: nextDepartureDateFrom,
      returnDateTo: departureDateTo
    };
  }

  return {
    ...request,
    departureDateFrom: nextDepartureDateFrom,
    departureDateTo
  };
}

export function withDepartureDateTo(
  request: SearchRequest,
  nextDepartureDateTo: string,
  useExactDates: boolean
): SearchRequest {
  const departureDateTo =
    syncLatestDateToEarliest(request.departureDateFrom, nextDepartureDateTo) ??
    nextDepartureDateTo;

  if (shouldSyncExactDates(request, useExactDates)) {
    return {
      ...request,
      departureDateTo,
      returnDateTo: departureDateTo
    };
  }

  return {
    ...request,
    departureDateTo
  };
}

export function withReturnDateFrom(
  request: SearchRequest,
  nextReturnDateFrom: string,
  useExactDates: boolean
): SearchRequest {
  const returnDateTo =
    syncLatestDateToEarliest(nextReturnDateFrom, request.returnDateTo) ??
    request.returnDateTo;

  if (shouldSyncExactDates(request, useExactDates)) {
    return {
      ...request,
      departureDateFrom: nextReturnDateFrom,
      departureDateTo: returnDateTo ?? request.departureDateTo,
      returnDateFrom: nextReturnDateFrom,
      returnDateTo
    };
  }

  return {
    ...request,
    returnDateFrom: nextReturnDateFrom,
    returnDateTo
  };
}

export function withReturnDateTo(
  request: SearchRequest,
  nextReturnDateTo: string,
  useExactDates: boolean
): SearchRequest {
  const returnDateTo =
    syncLatestDateToEarliest(request.returnDateFrom ?? "", nextReturnDateTo) ??
    nextReturnDateTo;

  if (shouldSyncExactDates(request, useExactDates)) {
    return {
      ...request,
      departureDateTo: returnDateTo,
      returnDateTo
    };
  }

  return {
    ...request,
    returnDateTo
  };
}
