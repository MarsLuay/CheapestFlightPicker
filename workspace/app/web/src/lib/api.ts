import type {
  AirlineRecord,
  AirportRecord,
  SearchJobStatus,
  SearchProgress,
  SearchRequest,
  SearchResponse,
  ServerLogEntry
} from "./types";
import { addClientLog } from "./admin-log";

type RequestJsonOptions<T> = {
  logStart?: boolean;
  logSuccess?: boolean;
  requestDetails?: string;
  successDetails?: (payload: T) => string | undefined;
  signal?: AbortSignal;
  timeoutMs?: number;
};

type RunFlightSearchOptions = {
  onProgress?: (progress: SearchProgress) => void;
  signal?: AbortSignal;
};

const searchJobTimeoutMs = 1000 * 60 * 20;
const maxSearchJobRecoveryAttempts = 1;

function isAbortError(error: unknown): error is DOMException {
  return error instanceof DOMException && error.name === "AbortError";
}

function toErrorMessage(
  error: unknown,
  url: string,
  options?: { canceled?: boolean }
): string {
  if (isAbortError(error)) {
    if (options?.canceled) {
      return `Request canceled for ${url}.`;
    }

    return `Request timed out for ${url}.`;
  }

  if (error instanceof TypeError) {
    return `Could not reach the local API for ${url}. If you're in dev mode, make sure the server is running.`;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return `Request failed for ${url}.`;
}

function joinLogDetails(parts: Array<string | undefined>): string | undefined {
  const normalized = parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));

  if (normalized.length === 0) {
    return undefined;
  }

  return normalized.join("\n\n");
}

function normalizeTimeWindow(
  window: SearchRequest["departureTimeWindow"]
): SearchRequest["departureTimeWindow"] | undefined {
  if (!window) {
    return undefined;
  }

  const rawFrom = Math.max(0, Math.min(24, Math.round(window.from)));
  const rawTo = Math.max(0, Math.min(24, Math.round(window.to)));

  if (rawFrom === 0 && rawTo === 24) {
    return undefined;
  }

  const from = rawFrom === 24 ? 23 : rawFrom;
  const to = rawTo === 24 ? 23 : rawTo;

  if (from <= to) {
    return { from, to };
  }

  return { from: to, to: from };
}

function buildSearchRequestDetails(request: SearchRequest): string {
  return JSON.stringify(
    {
      tripType: request.tripType,
      route: `${request.origin} -> ${request.destination}`,
      useExactDates: request.useExactDates ?? false,
      departureDateFrom: request.departureDateFrom,
      departureDateTo: request.departureDateTo,
      returnDateFrom: request.returnDateFrom ?? null,
      returnDateTo: request.returnDateTo ?? null,
      minimumTripDays: request.minimumTripDays ?? 0,
      maximumTripDays: request.maximumTripDays ?? 14,
      departureTimeWindow: request.departureTimeWindow ?? null,
      arrivalTimeWindow: request.arrivalTimeWindow ?? null,
      effectiveDepartureTimeWindow:
        normalizeTimeWindow(request.departureTimeWindow) ?? null,
      effectiveArrivalTimeWindow:
        normalizeTimeWindow(request.arrivalTimeWindow) ?? null,
      cabinClass: request.cabinClass,
      stopsFilter: request.stopsFilter,
      preferDirectBookingOnly: request.preferDirectBookingOnly,
      requireFreeCarryOnBag: request.requireFreeCarryOnBag ?? true,
      airlines: request.airlines,
      passengers: request.passengers,
      maxResults: request.maxResults
    },
    null,
    2
  );
}

function buildSearchSuccessDetails(payload: SearchResponse): string | undefined {
  if (!payload.ok) {
    return undefined;
  }

  const cheapestOverall = payload.summary.cheapestOverall
    ? `${payload.summary.cheapestOverall.currency} ${payload.summary.cheapestOverall.totalPrice}`
    : "none";

  return [
    `departureDateCandidates=${payload.summary.departureDatePrices.length}`,
    `returnDateCandidates=${payload.summary.returnDatePrices.length}`,
    `evaluatedDatePairs=${payload.summary.evaluatedDatePairs.length}`,
    `inspectedOptions=${payload.summary.inspectedOptions}`,
    `cheapestOverall=${cheapestOverall}`,
    `timingRecommendation=${payload.summary.timingGuidance?.recommendation ?? "none"}`,
    `priceAlert=${payload.summary.priceAlert?.kind ?? "none"}`,
    `separateOneWays=${payload.summary.hackerFareInsight ? "present" : "none"}`
  ].join("\n");
}

function sleep(delayMs: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      signal?.removeEventListener("abort", handleAbort);
      resolve();
    }, delayMs);

    function handleAbort() {
      window.clearTimeout(timeout);
      signal?.removeEventListener("abort", handleAbort);
      reject(new DOMException("Aborted", "AbortError"));
    }

    if (signal?.aborted) {
      handleAbort();
      return;
    }

    signal?.addEventListener("abort", handleAbort, { once: true });
  });
}

async function requestJson<T>(
  url: string,
  init?: RequestInit,
  options?: RequestJsonOptions<T>
): Promise<T> {
  const method = init?.method ?? "GET";
  const timeoutMs = options?.timeoutMs ?? 45000;
  const controller = new AbortController();
  let didTimeout = false;
  const timeout = window.setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, timeoutMs);
  const startedAt = performance.now();
  let alreadyLoggedFailure = false;
  const externalSignal = options?.signal;

  function forwardAbort() {
    controller.abort();
  }

  if (externalSignal?.aborted) {
    forwardAbort();
  } else {
    externalSignal?.addEventListener("abort", forwardAbort, { once: true });
  }

  if (options?.logStart) {
    addClientLog("info", `${method} ${url} started`, options.requestDetails);
  }

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal
    });
    const rawBody = await response.text();
    const durationMs = Math.round(performance.now() - startedAt);
    const payload = rawBody ? (JSON.parse(rawBody) as T | SearchResponse) : null;

    if (!response.ok) {
      const message =
        payload &&
        typeof payload === "object" &&
        "error" in payload &&
        typeof payload.error === "string"
          ? payload.error
          : `${method} ${url} failed with status ${response.status}.`;

      addClientLog(
        "error",
        `${method} ${url} failed`,
        joinLogDetails([
          `status=${response.status}`,
          `durationMs=${durationMs}`,
          `message=${message}`,
          options?.requestDetails
        ])
      );
      alreadyLoggedFailure = true;
      throw new Error(message);
    }

    if (options?.logSuccess) {
      addClientLog(
        "info",
        `${method} ${url} succeeded`,
        joinLogDetails([
          `status=${response.status}`,
          `durationMs=${durationMs}`,
          options.successDetails?.(payload as T)
        ])
      );
    }

    return payload as T;
  } catch (error) {
    const wasCanceledByCaller =
      isAbortError(error) && externalSignal?.aborted && !didTimeout;

    if (wasCanceledByCaller) {
      throw error;
    }

    const message = toErrorMessage(error, url);
    if (!alreadyLoggedFailure) {
      addClientLog(
        "error",
        `${method} ${url} failed`,
        joinLogDetails([message, options?.requestDetails])
      );
    }
    throw new Error(message);
  } finally {
    window.clearTimeout(timeout);
    externalSignal?.removeEventListener("abort", forwardAbort);
  }
}

export async function searchAirports(query: string): Promise<AirportRecord[]> {
  if (!query.trim()) {
    return [];
  }

  try {
    const data = await requestJson<{ airports: AirportRecord[] }>(
      `/api/airports?query=${encodeURIComponent(query)}`
    );
    return data.airports;
  } catch {
    return [];
  }
}

export async function fetchNearestAirport(
  latitude: number,
  longitude: number
): Promise<AirportRecord> {
  const data = await requestJson<{ airport: AirportRecord }>(
    `/api/airports/nearest?latitude=${encodeURIComponent(String(latitude))}&longitude=${encodeURIComponent(String(longitude))}`,
    undefined,
    {
      timeoutMs: 10000
    }
  );

  return data.airport;
}

export async function searchAirlines(query: string): Promise<AirlineRecord[]> {
  try {
    const data = await requestJson<{ airlines: AirlineRecord[] }>(
      `/api/airlines?query=${encodeURIComponent(query)}`
    );
    return data.airlines;
  } catch {
    return [];
  }
}

export async function runFlightSearch(
  request: SearchRequest,
  optionsOrProgress?: RunFlightSearchOptions | ((progress: SearchProgress) => void)
): Promise<SearchResponse> {
  const options =
    typeof optionsOrProgress === "function"
      ? { onProgress: optionsOrProgress }
      : optionsOrProgress ?? {};
  const requestDetails = buildSearchRequestDetails(request);
  addClientLog("info", "POST /api/search started", requestDetails);
  const searchStartedAt = performance.now();
  let jobRecoveryAttempts = 0;

  async function createSearchJob(): Promise<{ jobId: string }> {
    return requestJson<{ jobId: string }>(
      "/api/search/jobs",
      {
        body: JSON.stringify(request),
        headers: {
          "content-type": "application/json"
        },
        method: "POST"
      },
      {
        signal: options.signal,
        timeoutMs: 15000
      }
    );
  }

  try {
    let job = await createSearchJob();

    while (true) {
      if (performance.now() - searchStartedAt > searchJobTimeoutMs) {
        throw new Error(
          "Search took too long to finish. Try narrowing the date window or lowering candidate depth."
        );
      }

      let jobStatus: SearchJobStatus;
      try {
        jobStatus = await requestJson<SearchJobStatus>(
          `/api/search/jobs/${job.jobId}`,
          undefined,
          {
            signal: options.signal,
            timeoutMs: 15000
          }
        );
      } catch (error) {
        const message = toErrorMessage(error, `/api/search/jobs/${job.jobId}`);

        if (
          message === "Search job not found" &&
          jobRecoveryAttempts < maxSearchJobRecoveryAttempts
        ) {
          jobRecoveryAttempts += 1;
          addClientLog(
            "warn",
            "Search job disappeared; restarting search",
            joinLogDetails([
              "The local server likely restarted while the search was in progress.",
              `recoveryAttempt=${jobRecoveryAttempts}`,
              requestDetails
            ])
          );
          options.onProgress?.({
            stage: "Restarting search",
            detail: "The local server restarted, so the search is starting again.",
            completedSteps: 0,
            totalSteps: 1,
            percent: 0
          });
          job = await createSearchJob();
          continue;
        }

        throw error;
      }
      options.onProgress?.(jobStatus.progress);

      if (jobStatus.status === "completed" && jobStatus.summary) {
        const response: SearchResponse = {
          ok: true,
          summary: jobStatus.summary
        };
        addClientLog(
          "info",
          "POST /api/search succeeded",
          joinLogDetails([
            `status=200`,
            buildSearchSuccessDetails(response)
          ])
        );
        return response;
      }

      if (jobStatus.status === "failed") {
        const message = jobStatus.error ?? "Search failed";
        addClientLog(
          "error",
          "POST /api/search failed",
          joinLogDetails([message, requestDetails])
        );
        return {
          ok: false,
          error: message
        };
      }

      await sleep(350, options.signal);
    }
  } catch (error) {
    if (options.signal?.aborted && isAbortError(error)) {
      addClientLog("warn", "POST /api/search canceled", requestDetails);
      throw new Error("Search canceled.");
    }

    const message = toErrorMessage(error, "/api/search");
    addClientLog(
      "error",
      "POST /api/search failed",
      joinLogDetails([message, requestDetails])
    );
    throw new Error(message);
  }
}

export async function fetchServerLogs(): Promise<ServerLogEntry[]> {
  const data = await requestJson<{ logs: ServerLogEntry[] }>(
    "/api/admin/logs",
    undefined,
    { timeoutMs: 10000 }
  );
  return data.logs;
}

export async function clearServerLogs(): Promise<void> {
  await requestJson<{ ok: true }>(
    "/api/admin/logs",
    {
      method: "DELETE"
    },
    {
      timeoutMs: 10000
    }
  );
}

export async function checkApiHealth(): Promise<boolean> {
  try {
    await requestJson<{ ok: true }>("/api/health", undefined, {
      timeoutMs: 10000
    });
    return true;
  } catch {
    return false;
  }
}
