import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchNearestAirport, runFlightSearch } from "./api";
import type {
  AirportRecord,
  SearchJobStatus,
  SearchRequest,
  SearchSummary
} from "./types";

function buildRequest(): SearchRequest {
  return {
    tripType: "round_trip",
    origin: "SEA",
    destination: "PIT",
    departureDateFrom: "2026-05-08",
    departureDateTo: "2026-05-15",
    returnDateFrom: "2026-05-15",
    returnDateTo: "2026-05-22",
    minimumTripDays: 7,
    maximumTripDays: 14,
    departureTimeWindow: { from: 6, to: 24 },
    arrivalTimeWindow: { from: 6, to: 24 },
    cabinClass: "economy",
    stopsFilter: "any",
    preferDirectBookingOnly: false,
    airlines: [],
    passengers: {
      adults: 1,
      children: 0,
      infantsInSeat: 0,
      infantsOnLap: 0
    },
    maxResults: 10
  };
}

function buildSummary(request: SearchRequest): SearchSummary {
  return {
    request,
    departureDatePrices: [],
    returnDatePrices: [],
    cheapestOverall: null,
    cheapestRoundTrip: null,
    cheapestTwoOneWays: null,
    cheapestNonstop: null,
    cheapestMultiStop: null,
    evaluatedDatePairs: [],
    inspectedOptions: 0,
    timingGuidance: null,
    priceAlert: null,
    hackerFareInsight: null
  };
}

function createJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      "content-type": "application/json"
    },
    status
  });
}

describe("runFlightSearch", () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalWindow) {
      globalThis.window = originalWindow;
    } else {
      Reflect.deleteProperty(
        globalThis as typeof globalThis & { window?: Window },
        "window"
      );
    }
    vi.restoreAllMocks();
  });

  it("restarts the search once when the job disappears after a server restart", async () => {
    globalThis.window = globalThis as typeof globalThis & Window;

    const request = buildRequest();
    const summary = buildSummary(request);
    const completedJob: SearchJobStatus = {
      id: "replacement-job",
      status: "completed",
      createdAt: "2026-03-25T07:59:13.100Z",
      updatedAt: "2026-03-25T07:59:16.100Z",
      progress: {
        stage: "Completed",
        detail: "Search finished",
        completedSteps: 10,
        totalSteps: 10,
        percent: 100
      },
      summary
    };

    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(createJsonResponse({ jobId: "missing-job" }, 202))
      .mockResolvedValueOnce(
        createJsonResponse({ error: "Search job not found", ok: false }, 404)
      )
      .mockResolvedValueOnce(
        createJsonResponse({ jobId: "replacement-job" }, 202)
      )
      .mockResolvedValueOnce(createJsonResponse(completedJob, 200));

    globalThis.fetch = fetchMock;

    const response = await runFlightSearch(request);

    expect(response).toEqual({
      ok: true,
      summary
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/search/jobs");
    expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/search/jobs/missing-job");
    expect(fetchMock.mock.calls[2]?.[0]).toBe("/api/search/jobs");
    expect(fetchMock.mock.calls[3]?.[0]).toBe(
      "/api/search/jobs/replacement-job"
    );
  });

  it("aborts an in-flight search when the caller cancels it", async () => {
    globalThis.window = globalThis as typeof globalThis & Window;

    const request = buildRequest();
    const controller = new AbortController();
    const runningJob: SearchJobStatus = {
      id: "running-job",
      status: "running",
      createdAt: "2026-03-25T07:59:13.100Z",
      updatedAt: "2026-03-25T07:59:14.100Z",
      progress: {
        stage: "Checking exact flight options",
        detail: "1 of 6 exact fare lookups finished",
        completedSteps: 1,
        totalSteps: 6,
        percent: 17
      }
    };

    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(createJsonResponse({ jobId: "running-job" }, 202))
      .mockResolvedValueOnce(createJsonResponse(runningJob, 200));

    globalThis.fetch = fetchMock;

    const responsePromise = runFlightSearch(request, {
      signal: controller.signal
    });

    await new Promise((resolve) => setTimeout(resolve, 10));
    controller.abort();

    await expect(responsePromise).rejects.toThrow("Search canceled.");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("emits the last failed-job preview before returning a rate-limit failure", async () => {
    globalThis.window = globalThis as typeof globalThis & Window;

    const request = buildRequest();
    const failedJob: SearchJobStatus = {
      id: "failed-job",
      status: "failed",
      createdAt: "2026-03-25T07:59:13.100Z",
      updatedAt: "2026-03-25T07:59:16.100Z",
      error:
        "Google Flights temporarily rate limited this search. Wait a minute and try again.",
      progress: {
        stage: "Failed",
        detail:
          "Google Flights temporarily rate limited this search. Wait a minute and try again.",
        completedSteps: 3,
        totalSteps: 9,
        percent: 33,
        previewSummary: {
          departureDatePrices: [{ date: "2026-05-08", price: 220 }],
          returnDatePrices: [{ date: "2026-05-15", price: 210 }],
          cheapestOverall: null,
          cheapestRoundTrip: null,
          cheapestTwoOneWays: null,
          cheapestNonstop: null,
          cheapestMultiStop: null,
          evaluatedDatePairs: [
            {
              departureDate: "2026-05-08",
              returnDate: "2026-05-15"
            }
          ],
          inspectedOptions: 4
        }
      }
    };
    const progressUpdates: SearchJobStatus["progress"][] = [];

    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(createJsonResponse({ jobId: "failed-job" }, 202))
      .mockResolvedValueOnce(createJsonResponse(failedJob, 200));

    globalThis.fetch = fetchMock;

    const response = await runFlightSearch(request, {
      onProgress(progress) {
        progressUpdates.push(progress);
      }
    });

    expect(response).toEqual({
      ok: false,
      error:
        "Google Flights temporarily rate limited this search. Wait a minute and try again."
    });
    expect(progressUpdates).toHaveLength(1);
    expect(progressUpdates[0]?.previewSummary?.departureDatePrices).toEqual([
      { date: "2026-05-08", price: 220 }
    ]);
    expect(progressUpdates[0]?.previewSummary?.evaluatedDatePairs).toEqual([
      {
        departureDate: "2026-05-08",
        returnDate: "2026-05-15"
      }
    ]);
  });
});

describe("fetchNearestAirport", () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalWindow) {
      globalThis.window = originalWindow;
    } else {
      Reflect.deleteProperty(
        globalThis as typeof globalThis & { window?: Window },
        "window"
      );
    }
    vi.restoreAllMocks();
  });

  it("sends coordinates in a POST body instead of the query string", async () => {
    globalThis.window = globalThis as typeof globalThis & Window;

    const airport: AirportRecord = {
      id: "123",
      name: "Seattle-Tacoma International Airport",
      city: "Seattle",
      country: "United States",
      iata: "SEA",
      icao: "KSEA",
      latitude: 47.4502,
      longitude: -122.3088
    };

    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(createJsonResponse({ airport }, 200));

    globalThis.fetch = fetchMock;

    const response = await fetchNearestAirport(47.4502, -122.3088);

    expect(response).toEqual(airport);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/airports/nearest");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      body: JSON.stringify({
        latitude: 47.4502,
        longitude: -122.3088
      }),
      headers: {
        "content-type": "application/json"
      },
      method: "POST"
    });
  });
});
