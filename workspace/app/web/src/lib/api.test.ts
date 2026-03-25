import { afterEach, describe, expect, it, vi } from "vitest";

import { runFlightSearch } from "./api";
import type { SearchJobStatus, SearchRequest, SearchSummary } from "./types";

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
    cheapestDirectThere: null,
    cheapestMultiStop: null,
    evaluatedDatePairs: [],
    inspectedOptions: 0
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
});
