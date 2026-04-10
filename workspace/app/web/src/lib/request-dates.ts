import type { SearchRequest } from "./types";
import { differenceInCalendarDays, shiftDateInput } from "./date-input";

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

function shiftLinkedDate(date: string | undefined, deltaDays: number): string | undefined {
  if (!date || deltaDays === 0) {
    return date;
  }

  return shiftDateInput(date, deltaDays);
}

function getMinimumReturnDateFrom(
  departureDateFrom: string,
  minimumTripDays: number
): string {
  return shiftDateInput(departureDateFrom, Math.max(0, minimumTripDays));
}

function syncReturnWindowToMinimumTrip(
  request: SearchRequest,
  departureDateFrom = request.departureDateFrom,
  minimumTripDays = request.minimumTripDays ?? 0
): Pick<SearchRequest, "returnDateFrom" | "returnDateTo"> {
  const returnDateFrom = getMinimumReturnDateFrom(
    departureDateFrom,
    minimumTripDays
  );
  const returnDateTo =
    syncLatestDateToEarliest(
      returnDateFrom,
      request.returnDateTo ?? request.returnDateFrom ?? returnDateFrom
    ) ?? returnDateFrom;

  return {
    returnDateFrom,
    returnDateTo
  };
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
    const departureFromDelta = differenceInCalendarDays(
      request.departureDateFrom,
      nextDepartureDateFrom
    );
    const departureToDelta = differenceInCalendarDays(
      request.departureDateTo,
      departureDateTo
    );

    return {
      ...request,
      departureDateFrom: nextDepartureDateFrom,
      departureDateTo,
      returnDateFrom: shiftLinkedDate(request.returnDateFrom, departureFromDelta),
      returnDateTo: shiftLinkedDate(request.returnDateTo, departureToDelta)
    };
  }

  const syncedReturnDates =
    request.tripType === "round_trip"
      ? syncReturnWindowToMinimumTrip(request, nextDepartureDateFrom)
      : {};

  return {
    ...request,
    departureDateFrom: nextDepartureDateFrom,
    departureDateTo,
    ...syncedReturnDates
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
    const departureToDelta = differenceInCalendarDays(
      request.departureDateTo,
      departureDateTo
    );

    return {
      ...request,
      departureDateTo,
      returnDateTo: shiftLinkedDate(request.returnDateTo, departureToDelta)
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
  const minimumReturnDateFrom =
    request.tripType === "round_trip" && !shouldSyncExactDates(request, useExactDates)
      ? getMinimumReturnDateFrom(
          request.departureDateFrom,
          request.minimumTripDays ?? 0
        )
      : nextReturnDateFrom;
  const returnDateFrom =
    nextReturnDateFrom < minimumReturnDateFrom
      ? minimumReturnDateFrom
      : nextReturnDateFrom;
  const returnDateTo =
    syncLatestDateToEarliest(returnDateFrom, request.returnDateTo) ??
    request.returnDateTo;

  if (shouldSyncExactDates(request, useExactDates)) {
    const returnFromDelta = differenceInCalendarDays(
      request.returnDateFrom ?? returnDateFrom,
      returnDateFrom
    );
    const returnToDelta = differenceInCalendarDays(
      request.returnDateTo ?? returnDateTo ?? returnDateFrom,
      returnDateTo ?? returnDateFrom
    );

    return {
      ...request,
      departureDateFrom:
        shiftLinkedDate(request.departureDateFrom, returnFromDelta) ??
        request.departureDateFrom,
      departureDateTo:
        shiftLinkedDate(request.departureDateTo, returnToDelta) ??
        request.departureDateTo,
      returnDateFrom,
      returnDateTo
    };
  }

  return {
    ...request,
    returnDateFrom,
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
    const returnToDelta = differenceInCalendarDays(
      request.returnDateTo ?? returnDateTo,
      returnDateTo
    );

    return {
      ...request,
      departureDateTo:
        shiftLinkedDate(request.departureDateTo, returnToDelta) ??
        request.departureDateTo,
      returnDateTo
    };
  }

  return {
    ...request,
    returnDateTo
  };
}

export function withMinimumTripDays(
  request: SearchRequest,
  nextMinimumTripDays: number
): SearchRequest {
  const minimumTripDays = Math.max(0, nextMinimumTripDays);
  const maximumTripDays = Math.max(request.maximumTripDays ?? 14, minimumTripDays);

  if (request.tripType !== "round_trip") {
    return {
      ...request,
      minimumTripDays,
      maximumTripDays
    };
  }

  const syncedReturnDates = syncReturnWindowToMinimumTrip(
    request,
    request.departureDateFrom,
    minimumTripDays
  );

  return {
    ...request,
    minimumTripDays,
    maximumTripDays,
    ...syncedReturnDates
  };
}
