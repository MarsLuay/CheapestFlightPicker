import {
  startTransition,
  useEffect,
  useRef,
  useState,
  type FocusEvent,
  type FormEvent
} from "react";

import { runFlightSearch } from "./lib/api";
import {
  buildAdjacentCabinBoxTitle,
  buildAdjacentCabinSearchRequest,
  getCabinLabel
} from "./lib/cabin-upgrade";
import {
  addDaysToLocalDate,
  clampDateInputToMinimum,
  differenceInCalendarDays,
  formatDateForInput,
  getLaterDateInput,
  shiftDateInput
} from "./lib/date-input";
import {
  withDepartureDateFrom,
  withDepartureDateTo,
  withMinimumTripDays,
  withReturnDateFrom,
  withReturnDateTo
} from "./lib/request-dates";
import {
  loadSavedSearchPreferences,
  saveSavedSearchPreferences
} from "./lib/saved-search-preferences";
import {
  loadSavedSearchDates,
  saveSavedSearchDates,
  type SavedSearchDates
} from "./lib/saved-search-dates";
import { loadSavedOrigin, saveSavedOrigin } from "./lib/saved-origin";
import {
  getBrowserTimeZone,
  inferOriginFromTimeZone
} from "./lib/timezone-origin";
import { isHostedApiModeEnabled } from "./lib/runtime-mode";
import type {
  SearchProgress,
  SearchRequest,
  SearchSummary,
  UpgradeFareCardState
} from "./lib/types";
import { AdminPanel } from "./components/AdminPanel";
import { AirlinePicker } from "./components/AirlinePicker";
import { AirportField } from "./components/AirportField";
import { ResultsView } from "./components/ResultsView";
import { TimeRangeSlider } from "./components/TimeRangeSlider";

const defaultDepartureStartOffsetDays = 44;
const defaultExactTripLengthDays = 7;
const defaultDateRangeSpanDays = 14;
const fallbackOriginAirport = "SEA";
const hostedSearchUnavailableMessage =
  "Won't work on the website :) I'm too broke to buy an API key to fix that, but if you run setup-and-launch.bat anywhere on your computer it will work properly!";
const rateLimitResumeDelayMs = 1000 * 60;

type OriginDetectionStatus =
  | "saved_preference_loaded"
  | "timezone_inferred"
  | "fallback_default";

type OriginSelectionSource =
  | "fallback_default"
  | "timezone_inferred"
  | "saved_preference"
  | "manual_override";

type OriginDetectionState = {
  status: OriginDetectionStatus;
  selectionSource: OriginSelectionSource;
  appliedOrigin: string;
  inferredAirport: string | null;
  browserTimeZone: string | null;
  matchedRegion: string | null;
  message: string;
};

type InitialFormState = {
  originDetection: OriginDetectionState;
  request: SearchRequest;
  useExactDates: boolean;
};

type ResumeSearchState = {
  availableAt: number;
  error: string;
  jobId?: string;
  previewSummary: SearchSummary | null;
  progress: SearchProgress | null;
  request: SearchRequest;
};

function createDefaultSearchDates(
  referenceDate = new Date(),
  options?: {
    maximumTripDays?: number;
    minimumTripDays?: number;
    useExactDates?: boolean;
  }
): SavedSearchDates {
  const minimumTripDays = options?.minimumTripDays ?? 14;
  const maximumTripDays = options?.maximumTripDays ?? 14;
  const useExactDates = options?.useExactDates ?? false;
  const departureStartDate = addDaysToLocalDate(
    referenceDate,
    defaultDepartureStartOffsetDays
  );
  const departureEndDate = addDaysToLocalDate(
    referenceDate,
    defaultDepartureStartOffsetDays + defaultDateRangeSpanDays
  );
  const returnStartDate = addDaysToLocalDate(
    departureStartDate,
    useExactDates ? defaultExactTripLengthDays : minimumTripDays
  );
  const returnEndDate = addDaysToLocalDate(
    departureEndDate,
    useExactDates ? defaultExactTripLengthDays : maximumTripDays
  );

  return {
    departureDateFrom: formatDateForInput(departureStartDate),
    departureDateTo: formatDateForInput(departureEndDate),
    returnDateFrom: formatDateForInput(returnStartDate),
    returnDateTo: formatDateForInput(returnEndDate)
  };
}

function createInitialRequest(
  origin: string,
  savedPreferences?: ReturnType<typeof loadSavedSearchPreferences>,
  savedDates?: ReturnType<typeof loadSavedSearchDates>
): SearchRequest {
  const minimumTripDays = savedPreferences?.minimumTripDays ?? 14;
  const maximumTripDays = savedPreferences?.maximumTripDays ?? 14;
  const useExactDates = savedPreferences?.useExactDates ?? false;
  const rawInitialDates =
    savedDates ??
    createDefaultSearchDates(new Date(), {
      minimumTripDays,
      maximumTripDays,
      useExactDates
    });
  const initialDates = useExactDates
    ? rawInitialDates
    : (() => {
        const minimumReturnDateFrom = shiftDateInput(
          rawInitialDates.departureDateFrom,
          minimumTripDays
        );
        const returnDateFrom =
          rawInitialDates.returnDateFrom < minimumReturnDateFrom
            ? minimumReturnDateFrom
            : rawInitialDates.returnDateFrom;

        return {
          ...rawInitialDates,
          returnDateFrom,
          returnDateTo:
            rawInitialDates.returnDateTo < returnDateFrom
              ? returnDateFrom
              : rawInitialDates.returnDateTo
        };
      })();

  return {
    tripType: "round_trip",
    origin: savedPreferences?.origin ?? origin,
    destination: savedPreferences?.destination ?? "",
    departureDateFrom: initialDates.departureDateFrom,
    departureDateTo: initialDates.departureDateTo,
    returnDateFrom: initialDates.returnDateFrom,
    returnDateTo: initialDates.returnDateTo,
    minimumTripDays,
    maximumTripDays,
    departureTimeWindow: savedPreferences?.departureTimeWindow ?? {
      from: 6,
      to: 24
    },
    arrivalTimeWindow: savedPreferences?.arrivalTimeWindow ?? {
      from: 6,
      to: 24
    },
    cabinClass: "economy",
    stopsFilter: "any",
    preferDirectBookingOnly: false,
    requireFreeCarryOnBag: savedPreferences?.requireFreeCarryOnBag ?? true,
    airlines: [],
    passengers: {
      adults: 1,
      children: 0,
      infantsInSeat: 0,
      infantsOnLap: 0
    },
    maxResults: 12
  };
}

function resolveInitialFormState(): InitialFormState {
  const savedSearchPreferences = loadSavedSearchPreferences();
  const savedSearchDates = loadSavedSearchDates();
  const savedOrigin = savedSearchPreferences?.origin ?? loadSavedOrigin();

  if (savedOrigin) {
    return {
      originDetection: {
        status: "saved_preference_loaded",
        selectionSource: "saved_preference",
        appliedOrigin: savedOrigin,
        inferredAirport: savedOrigin,
        browserTimeZone: getBrowserTimeZone(),
        matchedRegion: null,
        message: `Using your saved origin airport, ${savedOrigin}.`
      },
      request: createInitialRequest(
        savedOrigin,
        savedSearchPreferences,
        savedSearchDates
      ),
      useExactDates: savedSearchPreferences?.useExactDates ?? false
    };
  }

  const browserTimeZone = getBrowserTimeZone();
  const inferredOrigin = inferOriginFromTimeZone(browserTimeZone);
  if (inferredOrigin) {
    return {
      originDetection: {
        status: "timezone_inferred",
        selectionSource: "timezone_inferred",
        appliedOrigin: inferredOrigin.origin,
        inferredAirport: inferredOrigin.origin,
        browserTimeZone: inferredOrigin.timeZone,
        matchedRegion: inferredOrigin.regionLabel,
        message: `Using ${inferredOrigin.origin} as a broad fallback for ${inferredOrigin.regionLabel}.`
      },
      request: createInitialRequest(
        inferredOrigin.origin,
        savedSearchPreferences,
        savedSearchDates
      ),
      useExactDates: savedSearchPreferences?.useExactDates ?? false
    };
  }

  return {
    originDetection: {
      status: "fallback_default",
      selectionSource: "fallback_default",
      appliedOrigin: fallbackOriginAirport,
      inferredAirport: fallbackOriginAirport,
      browserTimeZone,
      matchedRegion: null,
      message: `Using the default fallback airport, ${fallbackOriginAirport}.`
    },
    request: createInitialRequest(
      fallbackOriginAirport,
      savedSearchPreferences,
      savedSearchDates
    ),
    useExactDates: savedSearchPreferences?.useExactDates ?? false
  };
}

function createInitialUpgradeFareCardState(
  summary: SearchSummary,
  submittedRequest: SearchRequest
): UpgradeFareCardState {
  const title = buildAdjacentCabinBoxTitle(submittedRequest.cabinClass);
  const adjacentRequest = buildAdjacentCabinSearchRequest(submittedRequest);
  const baseCabinLabel = getCabinLabel(submittedRequest.cabinClass).toLowerCase();

  if (!adjacentRequest) {
    return {
      title,
      targetCabinClass: submittedRequest.cabinClass,
      request: summary.request,
      option: summary.cheapestOverall,
      progress: null,
      status: "mirrored",
      summaryNote:
        "You already searched the highest cabin, so this mirrors the main cheapest fare.",
      emptyMessage: "No first-class fare qualified in the main search."
    };
  }

  const targetCabinLabel = getCabinLabel(adjacentRequest.cabinClass).toLowerCase();

  return {
    title,
    targetCabinClass: adjacentRequest.cabinClass,
    request: adjacentRequest,
    option: null,
    progress: {
      stage: "Preparing adjacent cabin search",
      detail: `Starting a ${targetCabinLabel} follow-up search after the ${baseCabinLabel} results loaded.`,
      completedSteps: 0,
      totalSteps: 1,
      percent: 0
    },
    status: "searching",
    summaryNote: `Checking the next cabin up from your selected ${baseCabinLabel} search.`,
    emptyMessage: `Searching ${targetCabinLabel} fares one cabin above your selected ${baseCabinLabel} search.`
  };
}

function createLivePreviewSummary(
  request: SearchRequest,
  previewSummary?: SearchProgress["previewSummary"] | null
): SearchSummary {
  return {
    request,
    departureDatePrices: previewSummary?.departureDatePrices ?? [],
    returnDatePrices: previewSummary?.returnDatePrices ?? [],
    cheapestOverall: previewSummary?.cheapestOverall ?? null,
    cheapestRoundTrip: previewSummary?.cheapestRoundTrip ?? null,
    cheapestTwoOneWays: previewSummary?.cheapestTwoOneWays ?? null,
    cheapestNonstop: previewSummary?.cheapestNonstop ?? null,
    cheapestMultiStop: previewSummary?.cheapestMultiStop ?? null,
    evaluatedDatePairs: previewSummary?.evaluatedDatePairs ?? [],
    inspectedOptions: previewSummary?.inspectedOptions ?? 0,
    timingGuidance: null,
    priceAlert: null,
    hackerFareInsight: null
  };
}

function hasMeaningfulSummary(summary: SearchSummary | null): boolean {
  if (!summary) {
    return false;
  }

  return (
    summary.inspectedOptions > 0 ||
    summary.evaluatedDatePairs.length > 0 ||
    summary.departureDatePrices.length > 0 ||
    summary.returnDatePrices.length > 0 ||
    summary.cheapestOverall !== null ||
    summary.cheapestRoundTrip !== null ||
    summary.cheapestTwoOneWays !== null ||
    summary.cheapestNonstop !== null ||
    summary.cheapestMultiStop !== null
  );
}

function isRateLimitSearchError(message: string): boolean {
  return /rate.?limit|too many requests|temporarily rate limited/iu.test(message);
}

function selectInputValueOnFocus(event: FocusEvent<HTMLInputElement>) {
  const input = event.currentTarget;
  window.requestAnimationFrame(() => {
    input.select();
  });
}

function isIataCode(value: string): boolean {
  return /^[A-Za-z]{3}$/u.test(value.trim());
}

function getSearchValidationError(request: SearchRequest): string | null {
  const todayDateInput = getTodayDateInput();

  if (!isIataCode(request.origin)) {
    return "Choose an origin airport from the suggestions or enter a 3-letter airport code.";
  }

  if (!isIataCode(request.destination)) {
    return "Choose a destination airport from the suggestions or enter a 3-letter airport code.";
  }

  if (request.origin.trim().toUpperCase() === request.destination.trim().toUpperCase()) {
    return "Pick a destination airport that is different from your origin.";
  }

  if (!request.departureDateFrom || !request.departureDateTo) {
    return "Choose a valid departure date window.";
  }

  if (request.departureDateFrom > request.departureDateTo) {
    return "The latest departure date has to be on or after the earliest departure date.";
  }

  if (
    request.departureDateFrom < todayDateInput ||
    request.departureDateTo < todayDateInput
  ) {
    return "Dates can't be in the past.";
  }

  if (request.tripType === "round_trip") {
    if (!request.returnDateFrom || !request.returnDateTo) {
      return "Choose a valid return date window for a round-trip search.";
    }

    if (request.returnDateFrom > request.returnDateTo) {
      return "The latest return date has to be on or after the earliest return date.";
    }

    if (
      request.returnDateFrom < todayDateInput ||
      request.returnDateTo < todayDateInput
    ) {
      return "Dates can't be in the past.";
    }
  }

  return null;
}

function getTodayDateInput(): string {
  return formatDateForInput(new Date());
}

function getMinimumReturnDateFrom(
  request: SearchRequest,
  useExactDates: boolean,
  minimumDate = getTodayDateInput()
): string | undefined {
  if (request.tripType !== "round_trip") {
    return undefined;
  }

  const tripReturnMinimum = useExactDates
    ? request.departureDateFrom
    : shiftDateInput(request.departureDateFrom, request.minimumTripDays ?? 0);

  return getLaterDateInput(tripReturnMinimum, minimumDate);
}

function getMinimumReturnDateTo(
  request: SearchRequest,
  useExactDates: boolean,
  minimumDate = getTodayDateInput()
): string | undefined {
  return getLaterDateInput(
    request.returnDateFrom,
    getMinimumReturnDateFrom(request, useExactDates, minimumDate)
  );
}

export default function App() {
  const hostedApiMode = isHostedApiModeEnabled();
  const [initialFormState] = useState(resolveInitialFormState);
  const [request, setRequest] = useState<SearchRequest>(initialFormState.request);
  const [summary, setSummary] = useState<SearchSummary | null>(null);
  const [livePreviewSummary, setLivePreviewSummary] =
    useState<SearchSummary | null>(null);
  const [upgradeFareBox, setUpgradeFareBox] = useState<UpgradeFareCardState | null>(
    null
  );
  const [upgradeSearchRequest, setUpgradeSearchRequest] =
    useState<SearchRequest | null>(null);
  const [error, setError] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [hasCompletedSearch, setHasCompletedSearch] = useState(false);
  const [searchProgress, setSearchProgress] = useState<SearchProgress | null>(null);
  const [resumeSearchState, setResumeSearchState] =
    useState<ResumeSearchState | null>(null);
  const [resumeNow, setResumeNow] = useState(() => Date.now());
  const [useExactDates, setUseExactDates] = useState(initialFormState.useExactDates);
  const [minimumTripDaysInput, setMinimumTripDaysInput] = useState(
    String(initialFormState.request.minimumTripDays ?? 0)
  );
  const [maximumTripDaysInput, setMaximumTripDaysInput] = useState(
    String(initialFormState.request.maximumTripDays ?? 14)
  );
  const [originDetection, setOriginDetection] = useState<OriginDetectionState>(
    () => initialFormState.originDetection
  );
  const requestRef = useRef<SearchRequest>(request);
  const mainSearchAbortControllerRef = useRef<AbortController | null>(null);
  const mainSearchRunIdRef = useRef(0);
  const upgradeSearchAbortControllerRef = useRef<AbortController | null>(null);
  const upgradeSearchRunIdRef = useRef(0);

  useEffect(() => {
    if (!resumeSearchState || isSearching) {
      return;
    }

    setResumeNow(Date.now());
    const interval = window.setInterval(() => {
      setResumeNow(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, [isSearching, resumeSearchState]);

  function persistSavedSearchPreferences(
    nextRequest: SearchRequest,
    nextUseExactDates: boolean
  ) {
    saveSavedOrigin(nextRequest.origin);
    saveSavedSearchPreferences({
      origin: nextRequest.origin,
      destination: nextRequest.destination,
      useExactDates: nextUseExactDates,
      minimumTripDays: nextRequest.minimumTripDays ?? 0,
      maximumTripDays: nextRequest.maximumTripDays ?? 14,
      departureTimeWindow: nextRequest.departureTimeWindow ?? {
        from: 0,
        to: 24
      },
      arrivalTimeWindow: nextRequest.arrivalTimeWindow ?? {
        from: 0,
        to: 24
      },
      requireFreeCarryOnBag: nextRequest.requireFreeCarryOnBag ?? true
    });
  }

  function persistSavedSearchDates(nextRequest: SearchRequest) {
    saveSavedSearchDates({
      departureDateFrom: nextRequest.departureDateFrom,
      departureDateTo: nextRequest.departureDateTo,
      returnDateFrom: nextRequest.returnDateFrom ?? nextRequest.departureDateTo,
      returnDateTo: nextRequest.returnDateTo ?? nextRequest.departureDateTo
    });
  }

  function updateRequest(
    updater: SearchRequest | ((currentRequest: SearchRequest) => SearchRequest),
    options?: {
      nextUseExactDates?: boolean;
      persistDates?: boolean;
    }
  ) {
    const nextUseExactDates = options?.nextUseExactDates ?? useExactDates;
    const nextRequest =
      typeof updater === "function"
        ? (updater as (currentRequest: SearchRequest) => SearchRequest)(
            requestRef.current
          )
        : updater;

    requestRef.current = nextRequest;
    persistSavedSearchPreferences(nextRequest, nextUseExactDates);
    if (options?.persistDates) {
      persistSavedSearchDates(nextRequest);
    }
    setRequest(nextRequest);
  }

  function updateTripType(nextTripType: SearchRequest["tripType"]) {
    updateRequest((currentRequest) => ({
      ...currentRequest,
      tripType: nextTripType,
      returnDateFrom: currentRequest.returnDateFrom,
      returnDateTo: currentRequest.returnDateTo
    }));
  }

  function updateDepartureDateFrom(nextDepartureDateFrom: string) {
    updateRequest((currentRequest) =>
      withDepartureDateFrom(
        currentRequest,
        clampDateInputToMinimum(nextDepartureDateFrom, getTodayDateInput()),
        useExactDates
      ),
      { persistDates: true }
    );
  }

  function updateReturnDateFrom(nextReturnDateFrom: string) {
    updateRequest(
      (currentRequest) => {
        const minimumReturnDate =
          getMinimumReturnDateFrom(currentRequest, useExactDates) ??
          getTodayDateInput();

        return withReturnDateFrom(
          currentRequest,
          clampDateInputToMinimum(nextReturnDateFrom, minimumReturnDate),
          useExactDates
        );
      },
      { persistDates: true }
    );
  }

  function updateDepartureDateTo(nextDepartureDateTo: string) {
    updateRequest((currentRequest) =>
      withDepartureDateTo(
        currentRequest,
        clampDateInputToMinimum(nextDepartureDateTo, getTodayDateInput()),
        useExactDates
      ),
      { persistDates: true }
    );
  }

  function updateReturnDateTo(nextReturnDateTo: string) {
    updateRequest(
      (currentRequest) => {
        const minimumReturnDate =
          getMinimumReturnDateTo(currentRequest, useExactDates) ??
          getTodayDateInput();

        return withReturnDateTo(
          currentRequest,
          clampDateInputToMinimum(nextReturnDateTo, minimumReturnDate),
          useExactDates
        );
      },
      { persistDates: true }
    );
  }

  function updateMinimumTripDays(nextMinimumTripDays: number) {
    updateRequest(
      (currentRequest) => withMinimumTripDays(currentRequest, nextMinimumTripDays),
      { persistDates: true }
    );
  }

  function updateMaximumTripDays(nextMaximumTripDays: number) {
    updateRequest((currentRequest) => {
      const safeMaximumTripDays = Math.max(0, nextMaximumTripDays);
      const currentMinimumTripDays = currentRequest.minimumTripDays ?? 0;

      return {
        ...currentRequest,
        minimumTripDays: Math.min(
          currentMinimumTripDays,
          safeMaximumTripDays
        ),
        maximumTripDays: safeMaximumTripDays
      };
    });
  }

  function handleMinimumTripDaysInputChange(nextValue: string) {
    if (nextValue !== "" && !/^\d+$/u.test(nextValue)) {
      return;
    }

    setMinimumTripDaysInput(nextValue);
  }

  function commitMinimumTripDaysInput() {
    if (minimumTripDaysInput === "") {
      setMinimumTripDaysInput(String(requestRef.current.minimumTripDays ?? 0));
      return;
    }

    const normalizedValue = String(
      Math.max(0, Math.min(180, Number.parseInt(minimumTripDaysInput, 10) || 0))
    );
    setMinimumTripDaysInput(normalizedValue);
    updateMinimumTripDays(Number.parseInt(normalizedValue, 10));
  }

  function handleMaximumTripDaysInputChange(nextValue: string) {
    if (nextValue !== "" && !/^\d+$/u.test(nextValue)) {
      return;
    }

    setMaximumTripDaysInput(nextValue);
  }

  function commitMaximumTripDaysInput() {
    if (maximumTripDaysInput === "") {
      setMaximumTripDaysInput(String(requestRef.current.maximumTripDays ?? 14));
      return;
    }

    const normalizedValue = String(
      Math.max(0, Math.min(180, Number.parseInt(maximumTripDaysInput, 10) || 0))
    );
    setMaximumTripDaysInput(normalizedValue);
    updateMaximumTripDays(Number.parseInt(normalizedValue, 10));
  }

  useEffect(() => {
    setMinimumTripDaysInput(String(request.minimumTripDays ?? 0));
  }, [request.minimumTripDays]);

  useEffect(() => {
    setMaximumTripDaysInput(String(request.maximumTripDays ?? 14));
  }, [request.maximumTripDays]);

  function toggleExactDates(nextUseExactDates: boolean) {
    setUseExactDates(nextUseExactDates);
    if (nextUseExactDates && requestRef.current.tripType === "round_trip") {
      updateRequest(
        (currentRequest) => {
          const departureSpanDays = differenceInCalendarDays(
            currentRequest.departureDateFrom,
            currentRequest.departureDateTo
          );

          return {
            ...currentRequest,
            returnDateTo: currentRequest.returnDateFrom
              ? shiftDateInput(currentRequest.returnDateFrom, departureSpanDays)
              : currentRequest.returnDateTo
          };
        },
        {
          nextUseExactDates,
          persistDates: true
        }
      );
      return;
    }

    persistSavedSearchPreferences(requestRef.current, nextUseExactDates);
  }

  function handleCancelSearch() {
    const shouldKeepPreview = hasMeaningfulSummary(livePreviewSummary);

    mainSearchRunIdRef.current += 1;
    mainSearchAbortControllerRef.current?.abort();
    mainSearchAbortControllerRef.current = null;
    setIsSearching(false);
    setHasCompletedSearch(shouldKeepPreview);
    setSearchProgress(null);
    setError("");
    setSummary(null);

    if (!shouldKeepPreview) {
      setLivePreviewSummary(null);
    }
  }

  useEffect(() => {
    if (!upgradeSearchRequest || !summary) {
      return;
    }

    const controller = new AbortController();
    const runId = ++upgradeSearchRunIdRef.current;
    const baseCabinLabel = getCabinLabel(summary.request.cabinClass).toLowerCase();
    const targetCabinLabel = getCabinLabel(
      upgradeSearchRequest.cabinClass
    ).toLowerCase();

    upgradeSearchAbortControllerRef.current?.abort();
    upgradeSearchAbortControllerRef.current = controller;

    void runFlightSearch(upgradeSearchRequest, {
      onProgress(progress) {
        if (controller.signal.aborted || upgradeSearchRunIdRef.current !== runId) {
          return;
        }

        startTransition(() => {
          setUpgradeFareBox((current) => {
            if (!current) {
              return current;
            }

            return {
              ...current,
              option: progress.previewCheapestOverall ?? current.option,
              progress,
              status: "searching",
              summaryNote: progress.previewCheapestOverall
                ? `Best ${targetCabinLabel} fare so far while the follow-up search keeps checking more combinations.`
                : `Checking the next cabin up from your selected ${baseCabinLabel} search.`
            };
          });
        });
      },
      signal: controller.signal
    })
      .then((response) => {
        if (controller.signal.aborted || upgradeSearchRunIdRef.current !== runId) {
          return;
        }

        startTransition(() => {
          setUpgradeFareBox((current) => {
            if (!current) {
              return current;
            }

            if (!response.ok) {
              return current.option
                ? {
                    ...current,
                    progress: null,
                    status: "failed",
                    summaryNote: `The ${targetCabinLabel} follow-up search hit a snag, but this was the best fare found before it stopped.`
                  }
                : {
                    ...current,
                    progress: null,
                    status: "failed",
                    summaryNote: undefined,
                    emptyMessage: `The ${targetCabinLabel} follow-up search hit a snag: ${response.error}`
                  };
            }

            return {
              ...current,
              option: response.summary.cheapestOverall,
              progress: null,
              status: "ready",
              summaryNote: response.summary.cheapestOverall
                ? `Finished checking ${targetCabinLabel} fares one cabin above your selected ${baseCabinLabel} search.`
                : `Checked ${targetCabinLabel} fares one cabin above your selected ${baseCabinLabel} search.`,
              emptyMessage: `No ${targetCabinLabel} fare qualified one cabin above your selected ${baseCabinLabel} search.`
            };
          });
          setUpgradeSearchRequest(null);
        });
      })
      .catch((error) => {
        if (controller.signal.aborted || upgradeSearchRunIdRef.current !== runId) {
          return;
        }

        startTransition(() => {
          setUpgradeFareBox((current) => {
            if (!current) {
              return current;
            }

            return current.option
              ? {
                  ...current,
                  progress: null,
                  status: "failed",
                  summaryNote: `The ${targetCabinLabel} follow-up search stopped early, but this was the best fare found before it stopped.`
                }
              : {
                  ...current,
                  progress: null,
                  status: "failed",
                  summaryNote: undefined,
                  emptyMessage:
                    error instanceof Error
                      ? error.message
                      : `The ${targetCabinLabel} follow-up search stopped unexpectedly.`
                };
          });
          setUpgradeSearchRequest(null);
        });
      });

    return () => {
      controller.abort();
      if (upgradeSearchAbortControllerRef.current === controller) {
        upgradeSearchAbortControllerRef.current = null;
      }
    };
  }, [summary, upgradeSearchRequest]);

  async function startMainSearch(
    submittedRequest: SearchRequest,
    options?: {
      initialPreviewSummary?: SearchSummary | null;
      initialProgress?: SearchProgress | null;
      preservePreview?: boolean;
      resume?: boolean;
      resumeFromJobId?: string;
    }
  ) {
    const validationError = hostedApiMode
      ? null
      : getSearchValidationError(submittedRequest);

    if (validationError) {
      setError(validationError);
      return;
    }

    mainSearchRunIdRef.current += 1;
    mainSearchAbortControllerRef.current?.abort();
    mainSearchAbortControllerRef.current = null;
    upgradeSearchRunIdRef.current += 1;
    upgradeSearchAbortControllerRef.current?.abort();
    upgradeSearchAbortControllerRef.current = null;
    setUpgradeFareBox(null);
    setUpgradeSearchRequest(null);
    setError("");
    setSummary(null);
    setSearchProgress(null);
    setIsSearching(false);

    if (hostedApiMode) {
      setLivePreviewSummary(null);
      setHasCompletedSearch(false);
      setResumeSearchState(null);
      setError(hostedSearchUnavailableMessage);
      return;
    }

    const controller = new AbortController();
    const runId = ++mainSearchRunIdRef.current;
    const preservedPreviewSummary =
      options?.preservePreview && options.initialPreviewSummary
        ? options.initialPreviewSummary
        : options?.preservePreview
          ? livePreviewSummary
          : null;
    let latestPreviewSummary =
      preservedPreviewSummary ?? createLivePreviewSummary(submittedRequest);
    let latestProgress: SearchProgress | null = options?.initialProgress ?? null;
    let latestSearchJobId: string | undefined;
    let shouldShowCompletedResults = hasMeaningfulSummary(latestPreviewSummary);
    const initialSearchProgress: SearchProgress =
      options?.resume && latestProgress
        ? {
            ...latestProgress,
            stage: "Resuming search",
            detail:
              "Continuing the same search after the Google Flights cooldown while keeping the partial results below.",
            percent: Math.min(latestProgress.percent, 99)
          }
        : {
            stage: "Preparing search",
            detail: "Submitting your search request",
            completedSteps: 0,
            totalSteps: 1,
            percent: 0
          };

    mainSearchAbortControllerRef.current = controller;
    setResumeSearchState(null);
    setIsSearching(true);
    setLivePreviewSummary(latestPreviewSummary);
    setHasCompletedSearch(shouldShowCompletedResults);
    setSearchProgress(initialSearchProgress);

    try {
      const response = await runFlightSearch(submittedRequest, {
        onJobCreated(jobId) {
          latestSearchJobId = jobId;
        },
        onProgress(progress) {
          if (controller.signal.aborted || mainSearchRunIdRef.current !== runId) {
            return;
          }

          latestProgress = progress;
          latestPreviewSummary = createLivePreviewSummary(
            submittedRequest,
            progress.previewSummary
          );
          shouldShowCompletedResults = hasMeaningfulSummary(latestPreviewSummary);
          setSearchProgress(progress);
          startTransition(() => {
            setLivePreviewSummary(latestPreviewSummary);
          });
        },
        resumeFromJobId: options?.resumeFromJobId,
        signal: controller.signal
      });
      if (controller.signal.aborted || mainSearchRunIdRef.current !== runId) {
        return;
      }

      if (!response.ok) {
        const shouldOfferResume = isRateLimitSearchError(response.error);
        const shouldPreservePreview = hasMeaningfulSummary(latestPreviewSummary);

        setError(response.error);
        setSummary(null);
        setLivePreviewSummary(shouldPreservePreview ? latestPreviewSummary : null);
        setResumeSearchState(
          shouldOfferResume
            ? {
                availableAt: Date.now() + rateLimitResumeDelayMs,
                error: response.error,
                jobId: latestSearchJobId,
                previewSummary: shouldPreservePreview ? latestPreviewSummary : null,
                progress: latestProgress,
                request: submittedRequest
              }
            : null
        );
        shouldShowCompletedResults = shouldPreservePreview;
        return;
      }

      shouldShowCompletedResults = true;
      startTransition(() => {
        setSummary(response.summary);
        setLivePreviewSummary(null);
        setResumeSearchState(null);
        setUpgradeFareBox(
          hostedApiMode
            ? null
            : createInitialUpgradeFareCardState(response.summary, submittedRequest)
        );
      });
      setUpgradeSearchRequest(
        hostedApiMode
          ? null
          : buildAdjacentCabinSearchRequest(submittedRequest)
      );
    } catch (caughtError) {
      if (controller.signal.aborted || mainSearchRunIdRef.current !== runId) {
        return;
      }

      const message =
        caughtError instanceof Error
          ? caughtError.message
          : "Search failed unexpectedly";
      const shouldOfferResume = isRateLimitSearchError(message);
      const shouldPreservePreview = hasMeaningfulSummary(latestPreviewSummary);

      setError(message);
      setSummary(null);
      setLivePreviewSummary(shouldPreservePreview ? latestPreviewSummary : null);
      setResumeSearchState(
        shouldOfferResume
          ? {
              availableAt: Date.now() + rateLimitResumeDelayMs,
              error: message,
              jobId: latestSearchJobId,
              previewSummary: shouldPreservePreview ? latestPreviewSummary : null,
              progress: latestProgress,
              request: submittedRequest
            }
          : null
      );
      shouldShowCompletedResults = shouldPreservePreview;
    } finally {
      if (mainSearchRunIdRef.current === runId) {
        if (mainSearchAbortControllerRef.current === controller) {
          mainSearchAbortControllerRef.current = null;
        }
        setIsSearching(false);
        setHasCompletedSearch(shouldShowCompletedResults);
        setSearchProgress(null);
      }
    }
  }

  async function handleSearch(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    await startMainSearch({
      ...requestRef.current,
      useExactDates
    });
  }

  function handleResumeSearch() {
    if (!resumeSearchState || Date.now() < resumeSearchState.availableAt) {
      return;
    }

    void startMainSearch(resumeSearchState.request, {
      initialPreviewSummary: resumeSearchState.previewSummary,
      initialProgress: resumeSearchState.progress,
      preservePreview: true,
      resume: true,
      resumeFromJobId: resumeSearchState.jobId
    });
  }

  const displayedSummary = summary ?? livePreviewSummary;
  const resumeCooldownSeconds = resumeSearchState
    ? Math.max(0, Math.ceil((resumeSearchState.availableAt - resumeNow) / 1000))
    : 0;
  const canResumeSearch = Boolean(
    resumeSearchState && !isSearching && resumeCooldownSeconds === 0
  );
  const todayDateInput = getTodayDateInput();
  const minimumDepartureDateTo =
    getLaterDateInput(request.departureDateFrom, todayDateInput) ??
    todayDateInput;
  const earliestAllowedReturnDate = getMinimumReturnDateFrom(
    request,
    useExactDates,
    todayDateInput
  );
  const minimumReturnDateTo = getMinimumReturnDateTo(
    request,
    useExactDates,
    todayDateInput
  );

  const adminUiSnapshot = {
    route: {
      tripType: request.tripType,
      origin: request.origin,
      destination: request.destination,
      destinationState: request.destination ? "selected" : "empty",
      useExactDates,
      searchIntelligence: request.maxResults,
      cabinClass: request.cabinClass,
      stopsFilter: request.stopsFilter,
      preferDirectBookingOnly: request.preferDirectBookingOnly,
      requireFreeCarryOnBag: request.requireFreeCarryOnBag ?? true,
      airlines: request.airlines,
      passengers: request.passengers
    },
    dateRanges: {
      departureDateFrom: request.departureDateFrom,
      departureDateTo: request.departureDateTo,
      departureRangeValid: request.departureDateFrom <= request.departureDateTo,
      returnDateFrom: request.returnDateFrom ?? null,
      returnDateTo: request.returnDateTo ?? null,
      returnRangeValid:
        !request.returnDateFrom ||
        !request.returnDateTo ||
        request.returnDateFrom <= request.returnDateTo,
      returnDatesMatchDepartureRange:
        request.tripType === "round_trip" &&
        request.returnDateFrom === request.departureDateFrom &&
        request.returnDateTo === request.departureDateTo,
      minimumTripDays: request.minimumTripDays ?? 0,
      maximumTripDays: request.maximumTripDays ?? 14
    },
    timeWindows: {
      departureTimeWindow: request.departureTimeWindow ?? null,
      arrivalTimeWindow: request.arrivalTimeWindow ?? null
    },
    locationDetection: {
      ...originDetection,
      fallbackOrigin: fallbackOriginAirport
    },
    environment: {
      deploymentMode: hostedApiMode
        ? "hosted_direct_search"
        : "local_live_search"
    },
    searchState: {
      isSearching,
      hasCompletedSearch,
      latestError: error || null,
      progress: searchProgress
        ? {
            stage: searchProgress.stage,
            detail: searchProgress.detail ?? null,
            completedSteps: searchProgress.completedSteps,
            totalSteps: searchProgress.totalSteps,
            percent: searchProgress.percent
          }
        : null
    },
    upgradeSearch: upgradeFareBox
      ? {
          title: upgradeFareBox.title,
          targetCabinClass: upgradeFareBox.targetCabinClass,
          status: upgradeFareBox.status,
          progress: upgradeFareBox.progress
            ? {
                stage: upgradeFareBox.progress.stage,
                detail: upgradeFareBox.progress.detail ?? null,
                completedSteps: upgradeFareBox.progress.completedSteps,
                totalSteps: upgradeFareBox.progress.totalSteps,
                percent: upgradeFareBox.progress.percent
              }
            : null,
          currentBest: upgradeFareBox.option
            ? `${upgradeFareBox.option.currency} ${upgradeFareBox.option.totalPrice}`
            : null
        }
      : null,
    latestSummary: displayedSummary
      ? {
          inspectedOptions: displayedSummary.inspectedOptions,
          evaluatedDatePairs: displayedSummary.evaluatedDatePairs.length,
          departureDateCandidates: displayedSummary.departureDatePrices.length,
          returnDateCandidates: displayedSummary.returnDatePrices.length,
          cheapestOverall: displayedSummary.cheapestOverall
            ? {
                price: `${displayedSummary.cheapestOverall.currency} ${displayedSummary.cheapestOverall.totalPrice}`,
                source: displayedSummary.cheapestOverall.source,
                bookingSource: displayedSummary.cheapestOverall.bookingSource.label
              }
            : null,
          cheapestRoundTrip: displayedSummary.cheapestRoundTrip
            ? `${displayedSummary.cheapestRoundTrip.currency} ${displayedSummary.cheapestRoundTrip.totalPrice}`
            : null,
          cheapestTwoOneWays: displayedSummary.cheapestTwoOneWays
            ? `${displayedSummary.cheapestTwoOneWays.currency} ${displayedSummary.cheapestTwoOneWays.totalPrice}`
            : null,
          timingGuidance: displayedSummary.timingGuidance
            ? {
                recommendation: displayedSummary.timingGuidance.recommendation,
                confidence: displayedSummary.timingGuidance.confidence,
                trend: displayedSummary.timingGuidance.trend,
                pricePosition: displayedSummary.timingGuidance.pricePosition,
                historySampleSize: displayedSummary.timingGuidance.historySampleSize,
                summary: displayedSummary.timingGuidance.summary
              }
            : null,
          priceAlert: displayedSummary.priceAlert
            ? {
                kind: displayedSummary.priceAlert.kind,
                changePercent: displayedSummary.priceAlert.changePercent,
                summary: displayedSummary.priceAlert.summary
              }
            : null,
          separateOneWayInsight: displayedSummary.hackerFareInsight
            ? {
                summary: displayedSummary.hackerFareInsight.summary
              }
            : null
        }
      : null
  };

  return (
    <div className="app-shell">
      <div className="background-veil" />
      <AdminPanel uiSnapshot={adminUiSnapshot} />
      <main className="page">
        <section className="hero-card">
          <h1>Cheapest Flight Picker</h1>
          <p className="hero-copy">
            Find out what the cheapest (and best) time to book a flight is!
            Just enter in a flexible range (the more flexible the better), and
            press enter to find out the cheapest price that's offered with your
            specifications. Happy traveling!
          </p>
        </section>

        <section className="form-card">
          <form className="search-form" onSubmit={handleSearch}>
            <section className="form-section">
              <div className="section-heading">
                <p className="section-kicker">Start here</p>
                <h2>Route and filters</h2>
                <p className="section-copy">
                  Set the route first, then tighten fare filters and booking
                  preferences.
                </p>
              </div>

              <div className="form-subsection">
                <div className="form-subsection__heading">
                  <p className="section-kicker">Route</p>
                  <h3>Where and how you want to fly</h3>
                </div>
                <div className="form-grid">
                <div className="field filter-field">
                  <span>Trip type</span>
                  <div className="toggle-row">
                    {[
                      { label: "One way", value: "one_way" },
                      { label: "Round trip", value: "round_trip" }
                    ].map((option) => (
                      <button
                        key={option.value}
                        className={`toggle-pill ${
                          request.tripType === option.value ? "is-active" : ""
                        }`}
                        type="button"
                        onClick={() =>
                          updateTripType(option.value as SearchRequest["tripType"])
                        }
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                <AirportField
                  label="Origin airport"
                  value={request.origin}
                  onSelect={(origin) => {
                    updateRequest((currentRequest) => ({
                      ...currentRequest,
                      origin
                    }));
                    setOriginDetection((currentState) => ({
                      ...currentState,
                      selectionSource: "manual_override",
                      appliedOrigin: origin,
                      browserTimeZone:
                        currentState.browserTimeZone ?? getBrowserTimeZone(),
                      message: currentState.inferredAirport
                        ? `Origin manually changed to ${origin}. The initial fallback guess was ${currentState.inferredAirport}.`
                        : `Origin manually changed to ${origin}.`
                    }));
                  }}
                />

                <AirportField
                  label="Destination airport"
                  value={request.destination}
                  placeholder="Enter the airport, city, or code you want to fly to"
                  onSelect={(destination) =>
                    updateRequest((currentRequest) => ({
                      ...currentRequest,
                      destination
                    }))
                  }
                />
                </div>
              </div>

              <div className="form-subsection">
                <div className="form-subsection__heading">
                  <p className="section-kicker">Fare Filters</p>
                  <h3>Seat, stops, and carry-on rules</h3>
                </div>
                <div className="form-grid">
                <label className="field filter-field">
                  <span>Cabin</span>
                  <select
                    value={request.cabinClass}
                    onChange={(event) =>
                      updateRequest((currentRequest) => ({
                        ...currentRequest,
                        cabinClass: event.target.value as SearchRequest["cabinClass"]
                      }))
                    }
                  >
                    <option value="economy">Economy</option>
                    <option value="premium_economy">Premium economy</option>
                    <option value="business">Business</option>
                    <option value="first">First</option>
                  </select>
                </label>

                <label className="field filter-field">
                  <span>Stops</span>
                  <select
                    value={request.stopsFilter}
                    onChange={(event) =>
                      updateRequest((currentRequest) => ({
                        ...currentRequest,
                        stopsFilter: event.target.value as SearchRequest["stopsFilter"]
                      }))
                    }
                  >
                    <option value="any">Any</option>
                    <option value="nonstop">Nonstop</option>
                    <option value="max_1_stop">Up to 1 stop</option>
                    <option value="max_2_stops">Up to 2 stops</option>
                  </select>
                </label>

                <label className="checkbox-field filter-field">
                  <input
                    className="checkbox-field__input"
                    type="checkbox"
                    checked={request.requireFreeCarryOnBag ?? true}
                    onChange={(event) =>
                      updateRequest((currentRequest) => ({
                        ...currentRequest,
                        requireFreeCarryOnBag: event.target.checked
                      }))
                    }
                  />
                  <span className="checkbox-field__switch" aria-hidden="true">
                    <span className="checkbox-field__knob" />
                  </span>
                  <div>
                    <span>Require 1 free carry-on bag</span>
                    <p className="field-help">
                      Gets rid of flights with no free carry-on.
                    </p>
                  </div>
                </label>

                <label className="field filter-field">
                  <span>Search Intelligence</span>
                  <input
                    type="number"
                    min="1"
                    max="12"
                    value={request.maxResults}
                    onChange={(event) =>
                      updateRequest((currentRequest) => ({
                        ...currentRequest,
                        maxResults: Number.parseInt(event.target.value, 10) || 5
                      }))
                    }
                  />
                  <p className="field-help">
                    Choose a value from 1 to 12. Higher values make the search
                    smarter, while lower values make it faster.
                  </p>
                </label>
                </div>
              </div>

              <div className="form-subsection">
                <div className="form-subsection__heading">
                  <p className="section-kicker">Preferences</p>
                  <h3>How strict the search should be</h3>
                </div>
                <div className="form-grid">
                <label className="checkbox-field filter-field">
                  <input
                    className="checkbox-field__input"
                    type="checkbox"
                    checked={useExactDates}
                    onChange={(event) => toggleExactDates(event.target.checked)}
                  />
                  <span className="checkbox-field__switch" aria-hidden="true">
                    <span className="checkbox-field__knob" />
                  </span>
                  <div>
                    <span>Use exact dates</span>
                    <p className="field-help">
                      Pairs each departure date with the return date in the
                      same position inside the return window: earliest with
                      earliest, latest with latest.
                    </p>
                  </div>
                </label>

                <label className="checkbox-field filter-field">
                  <input
                    className="checkbox-field__input"
                    type="checkbox"
                    checked={request.preferDirectBookingOnly}
                    onChange={(event) =>
                      updateRequest((currentRequest) => ({
                        ...currentRequest,
                        preferDirectBookingOnly: event.target.checked
                      }))
                    }
                  />
                  <span className="checkbox-field__switch" aria-hidden="true">
                    <span className="checkbox-field__knob" />
                  </span>
                  <div>
                    <span>Prefer direct booking only</span>
                    <p className="field-help">
                      If Google can tell who is selling the ticket,
                      travel-agency fares are removed. If Google cannot tell,
                      the fare may still show up.
                    </p>
                  </div>
                </label>
                </div>
              </div>
            </section>

            <section className="form-section">
              <div className="section-heading">
                <div>
                  <p className="section-kicker">Dates</p>
                  <h2>Trip window</h2>
                  <p className="section-copy">
                    Give the app a flexible leaving and return window. If exact
                    dates is turned on above, the departure and return windows
                    stay linked together.
                  </p>
                </div>
              </div>

              <div className="date-window-grid">
                <section className="range-card">
                  <h3>Departure date range</h3>
                  <p className="field-help">
                    Pick the earliest and latest day you would be okay leaving.
                  </p>
                  <div className="range-grid">
                    <label className="field">
                      <span>Earliest departure</span>
                      <input
                        type="date"
                        min={todayDateInput}
                        value={request.departureDateFrom}
                        onChange={(event) =>
                          updateDepartureDateFrom(event.target.value)
                        }
                      />
                    </label>

                    <label className="field">
                      <span>Latest departure</span>
                      <input
                        type="date"
                        value={request.departureDateTo}
                        min={minimumDepartureDateTo}
                        onChange={(event) =>
                          updateDepartureDateTo(event.target.value)
                        }
                      />
                    </label>
                  </div>
                </section>

                {request.tripType === "round_trip" ? (
                  <section className="range-card">
                    <h3>Return date range</h3>
                    <p className="field-help">
                      Pick the earliest and latest day you would be okay coming
                      back.
                    </p>
                    <div className="range-grid">
                      <label className="field">
                        <span>Earliest return</span>
                        <input
                          type="date"
                          value={request.returnDateFrom ?? ""}
                          min={earliestAllowedReturnDate ?? todayDateInput}
                          onChange={(event) =>
                            updateReturnDateFrom(event.target.value)
                          }
                        />
                      </label>

                      <label className="field">
                        <span>Latest return</span>
                        <input
                          type="date"
                          value={request.returnDateTo ?? ""}
                          min={minimumReturnDateTo ?? todayDateInput}
                          onChange={(event) =>
                            updateReturnDateTo(event.target.value)
                          }
                        />
                      </label>

                      <label className="field">
                        <span>Minimum trip length</span>
                      <input
                        type="number"
                        min="0"
                        max="180"
                        value={minimumTripDaysInput}
                        disabled={useExactDates}
                        onFocus={selectInputValueOnFocus}
                        onBlur={commitMinimumTripDaysInput}
                        onChange={(event) =>
                          handleMinimumTripDaysInputChange(event.target.value)
                        }
                        />
                      </label>

                      <label className="field">
                        <span>Maximum trip length</span>
                      <input
                        type="number"
                        min="0"
                        max="180"
                        value={maximumTripDaysInput}
                        disabled={useExactDates}
                        onFocus={selectInputValueOnFocus}
                        onBlur={commitMaximumTripDaysInput}
                        onChange={(event) =>
                          handleMaximumTripDaysInputChange(event.target.value)
                        }
                      />
                      {useExactDates ? (
                        <p className="field-help">
                          Exact-date mode uses the matched return date for each
                          departure date, so trip-length filters are paused.
                        </p>
                      ) : null}
                    </label>
                  </div>
                </section>
                ) : null}
              </div>
            </section>

            <section className="form-section">
              <div className="section-heading">
                <p className="section-kicker">Timing</p>
                <h2>Departure and arrival hours</h2>
                <p className="section-copy">
                  Tighten the time of day if you want to avoid red-eyes,
                  ultra-early departures, or late arrivals.
                </p>
              </div>

              <div className="slider-grid">
                <TimeRangeSlider
                  label="Departure time window"
                  value={request.departureTimeWindow ?? { from: 0, to: 24 }}
                  onChange={(departureTimeWindow) =>
                    updateRequest((currentRequest) => ({
                      ...currentRequest,
                      departureTimeWindow
                    }))
                  }
                />

                <TimeRangeSlider
                  label="Arrival time window"
                  value={request.arrivalTimeWindow ?? { from: 0, to: 24 }}
                  onChange={(arrivalTimeWindow) =>
                    updateRequest((currentRequest) => ({
                      ...currentRequest,
                      arrivalTimeWindow
                    }))
                  }
                />
              </div>
            </section>

            <section className="form-section">
              <div className="section-heading">
                <p className="section-kicker">Optional</p>
                <h2>Airline picks</h2>
                <p className="section-copy">
                  Leave it blank for any airline, or lock the search to the
                  carriers you trust.
                </p>
              </div>

              <AirlinePicker
                selected={request.airlines}
                onChange={(airlines) =>
                  updateRequest((currentRequest) => ({
                    ...currentRequest,
                    airlines
                  }))
                }
              />
            </section>

            <div className="action-row">
              <div className="action-buttons">
                <button
                  className="primary-action"
                  type="submit"
                  disabled={isSearching}
                >
                  {isSearching
                    ? "Searching live fares..."
                    : "Find cheapest flights"}
                </button>
                {isSearching ? (
                  <button
                    className="secondary-action secondary-action--danger"
                    type="button"
                    onClick={handleCancelSearch}
                  >
                    Cancel live fare search
                  </button>
                ) : null}
              </div>
            </div>

            {isSearching ? (
              <div className="search-progress" role="status" aria-live="polite">
                <div
                  className="search-progress__bar"
                  aria-label="Searching live fares"
                  aria-valuemax={searchProgress?.totalSteps ?? 1}
                  aria-valuemin={0}
                  aria-valuenow={searchProgress?.completedSteps ?? 0}
                  role="progressbar"
                >
                  <div
                    className="search-progress__fill"
                    style={{ width: `${searchProgress?.percent ?? 0}%` }}
                  />
                </div>
                <div className="search-progress__copy">
                  <p className="muted-copy">
                    {searchProgress?.stage ?? "Searching live fares"}
                  </p>
                  {searchProgress?.detail ? (
                    <p className="muted-copy">{searchProgress.detail}</p>
                  ) : null}
                  <p className="muted-copy">
                    {searchProgress?.percent ?? 0}% complete
                    {searchProgress
                      ? ` (${searchProgress.completedSteps}/${searchProgress.totalSteps} steps)`
                      : ""}
                  </p>
                </div>
              </div>
            ) : null}

            {error ? (
              <div className="error-banner">
                <p>{error}</p>
                {resumeSearchState ? (
                  <div className="resume-search">
                    <p>
                      {hasMeaningfulSummary(resumeSearchState.previewSummary)
                        ? "Partial results are still shown below. Resume this same search after the Google Flights cooldown."
                        : "Resume this same search after the Google Flights cooldown."}
                    </p>
                    <button
                      className="secondary-action secondary-action--compact"
                      type="button"
                      disabled={!canResumeSearch}
                      onClick={handleResumeSearch}
                    >
                      {canResumeSearch
                        ? "Resume search"
                        : `Resume in ${resumeCooldownSeconds}s`}
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </form>
        </section>

        <ResultsView
          showResults={hasCompletedSearch || isSearching}
          isSearching={isSearching}
          mainSearchProgress={searchProgress}
          summary={displayedSummary}
          upgradeFareBox={upgradeFareBox}
        />

        <footer className="app-footer">
          <p className="app-footer__copy">
            Built by{" "}
            <a
              className="app-footer__link"
              href="https://github.com/MarsLuay"
              rel="noreferrer"
              target="_blank"
            >
              MarsLuay
            </a>
            . If this saved you some money, you can also support it on{" "}
            <a
              className="app-footer__link"
              href="https://buymeacoffee.com/marwanluaye"
              rel="noreferrer"
              target="_blank"
            >
              Buy Me a Coffee
            </a>
            .
          </p>
        </footer>
      </main>
    </div>
  );
}
