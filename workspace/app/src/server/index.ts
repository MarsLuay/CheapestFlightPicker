import fs from "node:fs";
import path from "node:path";
import { timingSafeEqual } from "node:crypto";

import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";

import { stableSerialize } from "../core/cache";
import {
  findClosestAirport,
  searchAirlines,
  searchAirports
} from "../core/catalog";
import { resolveAppPath } from "../core/project-paths";
import { clampTimeWindow } from "../core/utils";
import {
  appendServerLog,
  clearServerLogs,
  getServerLogs
} from "./admin-log";
import { ensureIncidentLogDirectory } from "./incident-log";
import { getSearchFailureResponse } from "./search-errors";
import { FlightSearchService } from "../core/search";
import {
  cancelSearchJob,
  completeSearchJob,
  createSearchJob,
  failSearchJob,
  getSearchJob,
  getSearchJobAbortSignal,
  getSearchJobWithCheckpoint,
  updateSearchJobResumeCheckpoint,
  updateSearchJobProgress
} from "./search-jobs";
import { searchRequestSchema } from "../shared/schemas";
import type { SearchRequest, SearchSummary } from "../shared/types";

const app = express();
const port = Number.parseInt(process.env.PORT ?? "8787", 10);
const searchService = new FlightSearchService();
const frontendRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 240,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    error: "Too many page requests. Please slow down and try again shortly.",
    ok: false
  }
});

function serializeThrownValue(
  value: unknown
): Record<string, unknown> {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack ?? null
    };
  }

  return {
    message: String(value)
  };
}

function buildClientIncident(
  input: unknown
): { message: string; details: Record<string, unknown> } {
  if (!input || typeof input !== "object") {
    return {
      message: "Client incident",
      details: {
        payloadType: input === null ? "null" : typeof input
      }
    };
  }

  const payload = input as Record<string, unknown>;
  const message =
    typeof payload.message === "string" && payload.message.trim()
      ? payload.message.trim()
      : "Client incident";
  const details: Record<string, unknown> = {};

  if (
    payload.level === "info" ||
    payload.level === "warn" ||
    payload.level === "error"
  ) {
    details.level = payload.level;
  }

  if (typeof payload.timestamp === "string") {
    details.reportedAt = payload.timestamp;
  }

  if (typeof payload.pageUrl === "string") {
    details.pageUrl = payload.pageUrl;
  }

  if (typeof payload.userAgent === "string") {
    details.userAgent = payload.userAgent;
  }

  if (typeof payload.details === "string") {
    details.details = payload.details;
  } else if (payload.details && typeof payload.details === "object") {
    details.details = payload.details as Record<string, unknown>;
  }

  return {
    message,
    details
  };
}

function registerProcessIncidentHandlers(): void {
  process.on("uncaughtException", (error) => {
    appendServerLog(
      "error",
      "Uncaught exception",
      serializeThrownValue(error),
      {
        persist: true,
        source: "process"
      }
    );
    console.error(error);
    process.exit(1);
  });

  process.on("unhandledRejection", (reason) => {
    appendServerLog(
      "error",
      "Unhandled promise rejection",
      serializeThrownValue(reason),
      {
        persist: true,
        source: "process"
      }
    );
    console.error(reason);
  });
}

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
    prioritizeMileFlights: request.prioritizeMileFlights ?? false,
    requireFreeCarryOnBag: request.requireFreeCarryOnBag ?? true,
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

function parseSearchJobPayload(input: unknown): {
  requestInput: unknown;
  resumeFromJobId?: string;
} {
  if (!input || typeof input !== "object") {
    return {
      requestInput: input
    };
  }

  const payload = input as Record<string, unknown>;
  if (!("request" in payload)) {
    return {
      requestInput: input
    };
  }

  return {
    requestInput: payload.request,
    resumeFromJobId:
      typeof payload.resumeFromJobId === "string" &&
      payload.resumeFromJobId.trim()
        ? payload.resumeFromJobId.trim()
        : undefined
  };
}

function searchJobRequestMatchesCheckpoint(
  requestInput: unknown,
  checkpointRequest: SearchRequest
): boolean {
  try {
    const parsedRequest = searchRequestSchema.parse(requestInput);
    return stableSerialize(parsedRequest) === stableSerialize(checkpointRequest);
  } catch {
    return false;
  }
}

function isVercelRuntime(): boolean {
  return process.env.VERCEL === "1" || process.env.VERCEL === "true";
}

function isVitestRuntime(): boolean {
  return process.env.VITEST === "true" || process.env.VITEST === "1";
}

function shouldStartStandaloneServer(): boolean {
  // Listen for normal `npm start` / `node dist/server/index.js`.
  // Skip under Vitest (tests import this module) and Vercel (serverless export).
  // Do not require argv[1] === import.meta.url: macOS realpath quirks
  // (/tmp vs /private/tmp) and npm wrappers make that check false and exit immediately.
  return !isVercelRuntime() && !isVitestRuntime();
}

function isLocalBrowserOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return false;
    }

    return (
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "[::1]"
    );
  } catch {
    return false;
  }
}

function getAllowedOrigins(): string[] {
  if (process.env.ALLOWED_ORIGINS) {
    return process.env.ALLOWED_ORIGINS.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean);
  }
  return [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    `http://localhost:${port}`,
    `http://127.0.0.1:${port}`,
    "http://localhost:8787",
    "http://127.0.0.1:8787"
  ];
}

app.use(
  cors({
    origin: (origin, callback) => {
      const allowedOrigins = getAllowedOrigins();
      if (
        !origin ||
        allowedOrigins.includes(origin) ||
        (!process.env.ALLOWED_ORIGINS && isLocalBrowserOrigin(origin))
      ) {
        callback(null, true);
        return;
      }

      // Deny without throwing so /api routes stay JSON instead of Express HTML 500 pages.
      callback(null, false);
    },
    credentials: true
  })
);
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

    if (request.path === "/api/health" && response.statusCode < 400) {
      return;
    }

    appendServerLog(
      response.statusCode >= 400 ? "error" : "info",
      `${request.method} ${request.path}`,
      {
        durationMs: Date.now() - startedAt,
        statusCode: response.statusCode
      },
      {
        persist: response.statusCode >= 500
      }
    );
  });

  next();
});

app.get("/api/health", (_request, response) => {
  response.json({ ok: true });
});

function requireAdminAuth(
  request: express.Request,
  response: express.Response,
  next: express.NextFunction
): void {
  const configuredKey = [
    process.env.ADMIN_API_KEY,
    process.env.ADMIN_KEY,
    process.env.ADMIN_TOKEN,
    process.env.ADMIN_SECRET
  ]
    .map((value) => value?.trim())
    .find((value): value is string => Boolean(value));

  if (!configuredKey) {
    response.status(401).json({
      error: "Admin authentication is not configured",
      ok: false
    });
    return;
  }

  const authorization = request.headers.authorization;
  const bearerKey =
    typeof authorization === "string" && /^Bearer\s+/iu.test(authorization)
      ? authorization.replace(/^Bearer\s+/iu, "").trim()
      : undefined;
  const headerValues = [
    request.headers["x-admin-key"],
    request.headers["x-admin-token"],
    request.headers["x-admin-secret"],
    request.headers["x-api-key"]
  ];
  const headerKey = headerValues
    .map((value) => (Array.isArray(value) ? value[0] : value))
    .find((value): value is string => typeof value === "string" && Boolean(value.trim()))
    ?.trim();
  const providedKey = bearerKey || headerKey;

  const configuredBuffer = Buffer.from(configuredKey);
  const providedBuffer = Buffer.from(providedKey ?? "");
  const matches =
    configuredBuffer.length === providedBuffer.length &&
    timingSafeEqual(configuredBuffer, providedBuffer);

  if (matches) {
    next();
    return;
  }

  response.status(401).json({
    error: "Unauthorized",
    ok: false
  });
}

app.use("/api/admin", requireAdminAuth);

app.get("/api/admin/logs", (_request, response) => {
  response.json({ logs: getServerLogs() });
});

app.delete("/api/admin/logs", (_request, response) => {
  clearServerLogs();
  response.json({ ok: true });
});

app.post("/api/admin/incidents", (request, response) => {
  const incident = buildClientIncident(request.body);
  appendServerLog(
    "error",
    `Client incident: ${incident.message}`,
    incident.details,
    {
      persist: true,
      source: "client"
    }
  );
  response.status(202).json({ ok: true });
});

app.get("/api/airports", (request, response) => {
  const query =
    typeof request.query.query === "string" ? request.query.query : "";
  response.json({ airports: searchAirports(query) });
});

app.post("/api/airports/nearest", (request, response) => {
  const latitude =
    typeof request.body?.latitude === "number"
      ? request.body.latitude
      : Number.NaN;
  const longitude =
    typeof request.body?.longitude === "number"
      ? request.body.longitude
      : Number.NaN;

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    response.status(400).json({
      error: "Latitude and longitude are required",
      ok: false
    });
    return;
  }

  const airport = findClosestAirport(latitude, longitude);
  if (!airport) {
    response.status(404).json({
      error: "Could not determine the closest airport",
      ok: false
    });
    return;
  }

  response.json({ airport });
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
    const failure = getSearchFailureResponse(error);
    appendServerLog("error", "POST /api/search failed", {
      ...requestSummary,
      error: failure.message,
      stack: error instanceof Error ? error.stack ?? null : null
    }, {
      persist: true
    });
    response.status(failure.statusCode).json({
      ok: false,
      error: failure.message
    });
  }
});

app.post("/api/search/jobs", (request, response) => {
  const jobPayload = parseSearchJobPayload(request.body);
  const requestSummary = summarizeSearchRequest(jobPayload.requestInput);
  const job = createSearchJob();
  const resumeSourceJob = jobPayload.resumeFromJobId
    ? getSearchJobWithCheckpoint(jobPayload.resumeFromJobId)
    : null;
  const resumeCheckpoint =
    resumeSourceJob?.resumeCheckpoint &&
    searchJobRequestMatchesCheckpoint(
      jobPayload.requestInput,
      resumeSourceJob.resumeCheckpoint.request
    )
      ? resumeSourceJob.resumeCheckpoint
      : null;

  appendServerLog("info", "POST /api/search/jobs started", {
    jobId: job.id,
    resumeFromJobId: jobPayload.resumeFromJobId ?? null,
    resumeCheckpointFound: Boolean(resumeCheckpoint),
    ...requestSummary
  });

  void (async () => {
    try {
      const summary = await searchService.search(
        jobPayload.requestInput,
        (progress) => {
          updateSearchJobProgress(job.id, progress);
        },
        {
          checkpointReporter(checkpoint) {
            updateSearchJobResumeCheckpoint(job.id, checkpoint);
          },
          resumeCheckpoint,
          signal: getSearchJobAbortSignal(job.id) ?? undefined
        }
      );
      if (getSearchJob(job.id)?.status === "failed") {
        return;
      }
      completeSearchJob(job.id, summary);
      appendServerLog("info", "POST /api/search/jobs completed", {
        jobId: job.id,
        resumeFromJobId: jobPayload.resumeFromJobId ?? null,
        resumeCheckpointUsed: Boolean(resumeCheckpoint),
        ...requestSummary,
        ...summarizeSearchSummary(summary)
      });
    } catch (error) {
      if (getSearchJob(job.id)?.error === "Search canceled.") {
        appendServerLog("info", "POST /api/search/jobs canceled", {
          jobId: job.id,
          ...requestSummary
        });
        return;
      }
      const failure = getSearchFailureResponse(error);
      const isAbort =
        error instanceof Error &&
        (error.name === "AbortError" || /aborted|canceled/iu.test(error.message));
      failSearchJob(
        job.id,
        isAbort ? "Search canceled." : failure.message
      );
      appendServerLog("error", "POST /api/search/jobs failed", {
        jobId: job.id,
        ...requestSummary,
        error: isAbort ? "Search canceled." : failure.message,
        stack: error instanceof Error ? error.stack ?? null : null
      }, {
        persist: !isAbort
      });
    }
  })();

  response.status(202).json({ jobId: job.id });
});

app.delete("/api/search/jobs/:id", (request, response) => {
  const job = cancelSearchJob(request.params.id);
  if (!job) {
    response.status(404).json({
      error: "Search job not found"
    });
    return;
  }

  appendServerLog("info", "DELETE /api/search/jobs canceled", {
    jobId: job.id
  });
  response.json(job);
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

const builtWebPath = resolveAppPath("public");
const builtWebIndexPath = path.join(builtWebPath, "index.html");
app.use(frontendRateLimit);
app.use(express.static(builtWebPath));

app.get("/{*path}", (_request, response) => {
  if (!fs.existsSync(builtWebIndexPath)) {
    response.status(503).json({
      error: "The web app has not been built yet.",
      ok: false
    });
    return;
  }

  response.sendFile(builtWebIndexPath);
});

app.use((
  error: unknown,
  request: express.Request,
  response: express.Response,
  next: express.NextFunction
) => {
  if (!request.path.startsWith("/api") || response.headersSent) {
    next(error);
    return;
  }

  const message =
    error instanceof Error && error.message.trim()
      ? error.message
      : "Request failed";
  const statusCode =
    typeof error === "object" &&
    error &&
    "status" in error &&
    typeof (error as { status?: unknown }).status === "number"
      ? (error as { status: number }).status
      : typeof error === "object" &&
          error &&
          "statusCode" in error &&
          typeof (error as { statusCode?: unknown }).statusCode === "number"
        ? (error as { statusCode: number }).statusCode
        : 400;

  response.status(statusCode >= 400 ? statusCode : 400).json({
    error: message,
    ok: false
  });
});

ensureIncidentLogDirectory();

if (shouldStartStandaloneServer()) {
  registerProcessIncidentHandlers();

  const server = app.listen(port, () => {
    appendServerLog("info", `Cheapest Flight Picker server listening on http://localhost:${port}`, { port });
  });

  server.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EADDRINUSE") {
      const message = `Port ${port} is already in use by another service. Set PORT to a free port (for example PORT=8788) and restart both the API and Vite so the proxy stays aligned.`;
      appendServerLog("error", message, { port });
      console.error(message);
      process.exit(1);
    }

    throw error;
  });
}

export default app;
