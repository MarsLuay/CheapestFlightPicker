import path from "node:path";

import cors from "cors";
import express from "express";

import { searchAirlines, searchAirports } from "../core/catalog";
import { resolveAppPath } from "../core/project-paths";
import { clampTimeWindow } from "../core/utils";
import {
  appendServerLog,
  clearServerLogs,
  getServerLogs
} from "./admin-log";
import { FlightSearchService } from "../core/search";
import {
  completeSearchJob,
  createSearchJob,
  failSearchJob,
  getSearchJob,
  updateSearchJobProgress
} from "./search-jobs";
import type { SearchRequest, SearchSummary } from "../shared/types";

const app = express();
const port = Number.parseInt(process.env.PORT ?? "8787", 10);
const searchService = new FlightSearchService();

function summarizeSearchRequest(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object") {
    return {
      requestType: input === null ? "null" : typeof input
    };
  }

  const request = input as Partial<SearchRequest>;
  const useExactDates =
    "useExactDates" in (input as Record<string, unknown>) &&
    typeof (input as Record<string, unknown>).useExactDates === "boolean"
      ? ((input as Record<string, unknown>).useExactDates as boolean)
      : false;

  return {
    tripType: request.tripType ?? "unknown",
    route:
      typeof request.origin === "string" &&
      typeof request.destination === "string"
        ? `${request.origin} -> ${request.destination}`
        : "unknown",
    useExactDates,
    departureDateFrom: request.departureDateFrom ?? null,
    departureDateTo: request.departureDateTo ?? null,
    returnDateFrom: request.returnDateFrom ?? null,
    returnDateTo: request.returnDateTo ?? null,
    minimumTripDays: request.minimumTripDays ?? 0,
    maximumTripDays: request.maximumTripDays ?? 14,
    departureTimeWindow: request.departureTimeWindow ?? null,
    arrivalTimeWindow: request.arrivalTimeWindow ?? null,
    effectiveDepartureTimeWindow:
      clampTimeWindow(request.departureTimeWindow) ?? null,
    effectiveArrivalTimeWindow:
      clampTimeWindow(request.arrivalTimeWindow) ?? null,
    cabinClass: request.cabinClass ?? null,
    stopsFilter: request.stopsFilter ?? null,
    preferDirectBookingOnly: request.preferDirectBookingOnly ?? false,
    airlines: Array.isArray(request.airlines) ? request.airlines : [],
    passengers: request.passengers ?? null,
    maxResults: request.maxResults ?? null
  };
}

function summarizeSearchSummary(summary: SearchSummary): Record<string, unknown> {
  const cheapestOverall = summary.cheapestOverall
    ? {
        totalPrice: summary.cheapestOverall.totalPrice,
        currency: summary.cheapestOverall.currency,
        source: summary.cheapestOverall.source,
        outboundDate: summary.cheapestOverall.outboundDate ?? null,
        returnDate: summary.cheapestOverall.returnDate ?? null
      }
    : null;

  return {
    inspectedOptions: summary.inspectedOptions,
    evaluatedDatePairs: summary.evaluatedDatePairs.length,
    departureDateCandidates: summary.departureDatePrices.length,
    returnDateCandidates: summary.returnDatePrices.length,
    cheapestOverall
  };
}

app.use(cors());
app.use(express.json());
app.use((request, response, next) => {
  const startedAt = Date.now();

  response.on("finish", () => {
    if (
      request.path === "/api/admin/logs" ||
      (request.method === "GET" && request.path.startsWith("/api/search/jobs/"))
    ) {
      return;
    }

    appendServerLog(
      response.statusCode >= 400 ? "error" : "info",
      `${request.method} ${request.path}`,
      {
        durationMs: Date.now() - startedAt,
        statusCode: response.statusCode
      }
    );
  });

  next();
});

app.get("/api/health", (_request, response) => {
  response.json({ ok: true });
});

app.get("/api/admin/logs", (_request, response) => {
  response.json({ logs: getServerLogs() });
});

app.delete("/api/admin/logs", (_request, response) => {
  clearServerLogs();
  response.json({ ok: true });
});

app.get("/api/airports", (request, response) => {
  const query =
    typeof request.query.query === "string" ? request.query.query : "";
  response.json({ airports: searchAirports(query) });
});

app.get("/api/airlines", (request, response) => {
  const query =
    typeof request.query.query === "string" ? request.query.query : "";
  response.json({ airlines: searchAirlines(query) });
});

app.post("/api/search", async (request, response) => {
  const requestSummary = summarizeSearchRequest(request.body);
  appendServerLog("info", "POST /api/search started", requestSummary);

  try {
    const summary = await searchService.search(request.body);
    appendServerLog("info", "POST /api/search completed", {
      ...requestSummary,
      ...summarizeSearchSummary(summary)
    });
    response.json({
      ok: true,
      summary
    });
  } catch (error) {
    appendServerLog("error", "POST /api/search failed", {
      ...requestSummary,
      error: error instanceof Error ? error.message : "Search failed",
      stack: error instanceof Error ? error.stack ?? null : null
    });
    response.status(400).json({
      ok: false,
      error: error instanceof Error ? error.message : "Search failed"
    });
  }
});

app.post("/api/search/jobs", (request, response) => {
  const requestSummary = summarizeSearchRequest(request.body);
  const job = createSearchJob();

  appendServerLog("info", "POST /api/search/jobs started", {
    jobId: job.id,
    ...requestSummary
  });

  void (async () => {
    try {
      const summary = await searchService.search(request.body, (progress) => {
        updateSearchJobProgress(job.id, progress);
      });
      completeSearchJob(job.id, summary);
      appendServerLog("info", "POST /api/search/jobs completed", {
        jobId: job.id,
        ...requestSummary,
        ...summarizeSearchSummary(summary)
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Search failed";
      failSearchJob(job.id, message);
      appendServerLog("error", "POST /api/search/jobs failed", {
        jobId: job.id,
        ...requestSummary,
        error: message,
        stack: error instanceof Error ? error.stack ?? null : null
      });
    }
  })();

  response.status(202).json({ jobId: job.id });
});

app.get("/api/search/jobs/:id", (request, response) => {
  const job = getSearchJob(request.params.id);
  if (!job) {
    response.status(404).json({
      error: "Search job not found",
      ok: false
    });
    return;
  }

  response.json(job);
});

const builtWebPath = resolveAppPath("dist", "web");
app.use(express.static(builtWebPath));

app.get("/{*path}", (_request, response) => {
  response.sendFile(path.join(builtWebPath, "index.html"));
});

app.listen(port, () => {
  appendServerLog("info", "Server started", { port });
  console.log(
    `Cheapest Flight Picker server listening on http://localhost:${port}`
  );
});
