import { useEffect, useState } from "react";

import {
  checkApiHealth,
  clearServerLogs as clearServerLogsRequest,
  fetchServerLogs
} from "../lib/api";
import {
  addClientLog,
  attachGlobalClientLogHandlers,
  clearClientLogs,
  useClientLogs,
  type ClientLogEntry
} from "../lib/admin-log";
import type { ServerLogEntry } from "../lib/types";

type AdminPanelProps = {
  uiSnapshot?: Record<string, unknown>;
};

type AdminUiSnapshot = {
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

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "short",
    timeStyle: "medium"
  }).format(new Date(value));
}

function toHumanLabel(value: string | null | undefined): string {
  if (!value) {
    return "n/a";
  }

  return value
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function SnapshotFacts({
  entries
}: {
  entries: Array<{ label: string; value: string }>;
}) {
  return (
    <dl className="admin-fact-list">
      {entries.map((entry) => (
        <div key={entry.label}>
          <dt>{entry.label}</dt>
          <dd>{entry.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function formatClientLogDetails(entry: ClientLogEntry): string {
  return entry.details ?? "";
}

function formatServerLogDetails(entry: ServerLogEntry): string {
  return entry.details ? JSON.stringify(entry.details, null, 2) : "";
}

function formatLogBlock(
  source: "client" | "server",
  entries: Array<ClientLogEntry | ServerLogEntry>
): string {
  if (entries.length === 0) {
    return `${source.toUpperCase()} LOGS\n(none)`;
  }

  return [
    `${source.toUpperCase()} LOGS`,
    ...entries.map((entry) => {
      const details =
        source === "client"
          ? formatClientLogDetails(entry as ClientLogEntry)
          : formatServerLogDetails(entry as ServerLogEntry);

      return [
        `[${entry.level.toUpperCase()}] ${entry.timestamp} ${entry.message}`,
        details
      ]
        .filter(Boolean)
        .join("\n");
    })
  ].join("\n\n");
}

function buildEnvironmentSnapshot(
  apiHealthy: boolean | null,
  clientLogs: ClientLogEntry[],
  serverLogs: ServerLogEntry[],
  lastUpdatedAt: string | null
): string {
  const clientErrors = clientLogs.filter((entry) => entry.level === "error").length;
  const serverErrors = serverLogs.filter((entry) => entry.level === "error").length;
  const latestClientError = clientLogs.find((entry) => entry.level === "error");
  const latestServerError = serverLogs.find((entry) => entry.level === "error");

  return JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      pageUrl: window.location.href,
      apiHealth: apiHealthy === null ? "checking" : apiHealthy ? "healthy" : "down",
      lastUpdatedAt,
      browserTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      language: navigator.language,
      online: navigator.onLine,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      userAgent: navigator.userAgent,
      clientLogCount: clientLogs.length,
      serverLogCount: serverLogs.length,
      clientErrorCount: clientErrors,
      serverErrorCount: serverErrors,
      latestClientError: latestClientError?.message ?? null,
      latestServerError: latestServerError?.message ?? null
    },
    null,
    2
  );
}

function buildDiagnosticsReport(
  apiHealthy: boolean | null,
  clientLogs: ClientLogEntry[],
  serverLogs: ServerLogEntry[],
  lastUpdatedAt: string | null,
  uiSnapshot?: Record<string, unknown>
): string {
  return [
    "CHEAPEST FLIGHT PICKER ADMIN REPORT",
    "",
    "ENVIRONMENT",
    buildEnvironmentSnapshot(apiHealthy, clientLogs, serverLogs, lastUpdatedAt),
    "",
    "CURRENT UI STATE",
    JSON.stringify(uiSnapshot ?? {}, null, 2),
    "",
    formatLogBlock("client", clientLogs),
    "",
    formatLogBlock("server", serverLogs)
  ].join("\n");
}

async function copyTextToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

export function AdminPanel({ uiSnapshot }: AdminPanelProps) {
  const clientLogs = useClientLogs();
  const [isOpen, setIsOpen] = useState(false);
  const [serverLogs, setServerLogs] = useState<ServerLogEntry[]>([]);
  const [apiHealthy, setApiHealthy] = useState<boolean | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("");

  async function refreshPanel() {
    const [healthy, logs] = await Promise.all([
      checkApiHealth(),
      fetchServerLogs().catch(() => [])
    ]);

    setApiHealthy(healthy);
    setServerLogs(logs);
    setLastUpdatedAt(new Date().toISOString());
  }

  async function handleCopy(label: string, text: string) {
    try {
      await copyTextToClipboard(text);
      setStatusMessage(`${label} copied to clipboard.`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Clipboard copy failed";
      addClientLog("error", `Copy ${label.toLowerCase()} failed`, message);
      setStatusMessage(`Could not copy ${label.toLowerCase()}.`);
    }
  }

  useEffect(() => {
    attachGlobalClientLogHandlers();
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.code !== "Backquote") {
        return;
      }

      setIsOpen((current) => !current);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    let cancelled = false;

    async function refresh() {
      try {
        const [healthy, logs] = await Promise.all([
          checkApiHealth(),
          fetchServerLogs().catch(() => [])
        ]);

        if (!cancelled) {
          setApiHealthy(healthy);
          setServerLogs(logs);
          setLastUpdatedAt(new Date().toISOString());
        }
      } catch (error) {
        if (!cancelled) {
          const message =
            error instanceof Error ? error.message : "Admin refresh failed";
          setStatusMessage("Admin refresh failed.");
          addClientLog("error", "Admin refresh failed", message);
        }
      }
    }

    void refresh();
    const timer = window.setInterval(() => {
      void refresh();
    }, 3000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const environmentSnapshot = buildEnvironmentSnapshot(
    apiHealthy,
    clientLogs,
    serverLogs,
    lastUpdatedAt
  );
  const diagnosticsReport = buildDiagnosticsReport(
    apiHealthy,
    clientLogs,
    serverLogs,
    lastUpdatedAt,
    uiSnapshot
  );
  const adminSnapshot = uiSnapshot as AdminUiSnapshot | undefined;
  const clientLogText = formatLogBlock("client", clientLogs);
  const serverLogText = formatLogBlock("server", serverLogs);
  const clientErrorCount = clientLogs.filter((entry) => entry.level === "error").length;
  const serverErrorCount = serverLogs.filter((entry) => entry.level === "error").length;
  const searchProgress = adminSnapshot?.searchState?.progress;
  const locationDetection = adminSnapshot?.locationDetection;
  const latestSummary = adminSnapshot?.latestSummary;
  const flightControlFacts = [
    {
      label: "Trip type",
      value: toHumanLabel(adminSnapshot?.route?.tripType)
    },
    {
      label: "Selected route",
      value: `${adminSnapshot?.route?.origin ?? "n/a"} -> ${
        adminSnapshot?.route?.destination || "(destination empty)"
      }`
    },
    {
      label: "Search Intelligence",
      value: String(adminSnapshot?.route?.searchIntelligence ?? "n/a")
    },
    {
      label: "Exact dates",
      value: adminSnapshot?.route?.useExactDates ? "enabled" : "flexible"
    },
    {
      label: "Departure range",
      value: adminSnapshot?.dateRanges?.departureRangeValid
        ? "valid"
        : "out of sync"
    },
    {
      label: "Return range",
      value: adminSnapshot?.dateRanges?.returnRangeValid ? "valid" : "out of sync"
    },
    {
      label: "Return locked to departure",
      value: adminSnapshot?.dateRanges?.returnDatesMatchDepartureRange ? "yes" : "no"
    },
    {
      label: "Search progress",
      value: searchProgress
        ? `${searchProgress.stage ?? "working"} (${searchProgress.percent ?? 0}%)`
        : "idle"
    }
  ];
  const originDetectionFacts = [
    {
      label: "Detection status",
      value: toHumanLabel(locationDetection?.status)
    },
    {
      label: "Selection source",
      value: toHumanLabel(locationDetection?.selectionSource)
    },
    {
      label: "Applied origin",
      value: locationDetection?.appliedOrigin ?? "n/a"
    },
    {
      label: "Inferred airport",
      value: locationDetection?.inferredAirport ?? "n/a"
    },
    {
      label: "Browser time zone",
      value: locationDetection?.browserTimeZone ?? "n/a"
    },
    {
      label: "Matched region",
      value: locationDetection?.matchedRegion ?? "n/a"
    },
    {
      label: "Fallback origin",
      value: locationDetection?.fallbackOrigin ?? "n/a"
    }
  ];
  const latestSignalFacts = [
    {
      label: "Cheapest overall",
      value: latestSummary?.cheapestOverall?.price ?? "n/a"
    },
    {
      label: "Round-trip best",
      value: latestSummary?.cheapestRoundTrip ?? "n/a"
    },
    {
      label: "Best two one-ways",
      value: latestSummary?.cheapestTwoOneWays ?? "n/a"
    },
    {
      label: "Timing guidance",
      value: latestSummary?.timingGuidance
        ? `${toHumanLabel(latestSummary.timingGuidance.recommendation)} (${toHumanLabel(
            latestSummary.timingGuidance.confidence
          )})`
        : "none"
    },
    {
      label: "Price alert",
      value: latestSummary?.priceAlert
        ? `${toHumanLabel(latestSummary.priceAlert.kind)}${
            typeof latestSummary.priceAlert.changePercent === "number"
              ? ` (${latestSummary.priceAlert.changePercent}%)`
              : ""
          }`
        : "none"
    },
    {
      label: "Separate one-ways",
      value: latestSummary?.separateOneWayInsight
        ? "lower than round-trip"
        : "none"
    },
    {
      label: "Date pairs evaluated",
      value: String(latestSummary?.evaluatedDatePairs ?? 0)
    },
    {
      label: "Options inspected",
      value: String(latestSummary?.inspectedOptions ?? 0)
    }
  ];

  return (
    <aside className="admin-panel">
      <div className="admin-panel__header">
        <div>
          <h2>Admin Mode</h2>
          <p className="muted-copy">
            API health:{" "}
            <strong>{apiHealthy === null ? "checking" : apiHealthy ? "healthy" : "down"}</strong>
          </p>
          <p className="muted-copy">
            Last updated:{" "}
            <strong>{lastUpdatedAt ? formatTimestamp(lastUpdatedAt) : "waiting"}</strong>
          </p>
          {statusMessage ? <p className="admin-status-copy">{statusMessage}</p> : null}
        </div>
        <div className="admin-panel__actions">
          <button type="button" className="admin-button" onClick={() => void refreshPanel()}>
            Refresh logs
          </button>
          <button
            type="button"
            className="admin-button"
            onClick={() => void handleCopy("diagnostics report", diagnosticsReport)}
          >
            Copy report
          </button>
          <button
            type="button"
            className="admin-button"
            onClick={() => void handleCopy("client logs", clientLogText)}
          >
            Copy client logs
          </button>
          <button
            type="button"
            className="admin-button"
            onClick={() => void handleCopy("server logs", serverLogText)}
          >
            Copy server logs
          </button>
          <button type="button" className="admin-button" onClick={clearClientLogs}>
            Clear client logs
          </button>
          <button
            type="button"
            className="admin-button"
            onClick={() => {
              void clearServerLogsRequest().then(() => {
                setServerLogs([]);
                setLastUpdatedAt(new Date().toISOString());
                setStatusMessage("Server logs cleared.");
              });
            }}
          >
            Clear server logs
          </button>
          <button type="button" className="admin-button" onClick={() => setIsOpen(false)}>
            Close
          </button>
        </div>
      </div>

      <div className="admin-summary-grid">
        <section className="admin-card admin-stat-card">
          <strong>{clientLogs.length}</strong>
          <span>Client log entries</span>
        </section>
        <section className="admin-card admin-stat-card">
          <strong>{serverLogs.length}</strong>
          <span>Server log entries</span>
        </section>
        <section className="admin-card admin-stat-card">
          <strong>{clientErrorCount}</strong>
          <span>Client errors</span>
        </section>
        <section className="admin-card admin-stat-card">
          <strong>{serverErrorCount}</strong>
          <span>Server errors</span>
        </section>
        <section className="admin-card admin-stat-card">
          <strong>{adminSnapshot?.route?.searchIntelligence ?? "n/a"}</strong>
          <span>Search Intelligence</span>
        </section>
        <section className="admin-card admin-stat-card">
          <strong>{locationDetection?.appliedOrigin ?? "n/a"}</strong>
          <span>Current origin</span>
        </section>
        <section className="admin-card admin-stat-card">
          <strong>
            {latestSummary?.timingGuidance
              ? toHumanLabel(latestSummary.timingGuidance.recommendation)
              : "None"}
          </strong>
          <span>Timing guidance</span>
        </section>
        <section className="admin-card admin-stat-card">
          <strong>
            {latestSummary?.priceAlert
              ? toHumanLabel(latestSummary.priceAlert.kind)
              : "None"}
          </strong>
          <span>Price alert</span>
        </section>
      </div>

      <div className="admin-panel__grid">
        <section className="admin-card">
          <h3>Flight Controls</h3>
          <SnapshotFacts entries={flightControlFacts} />
          {searchProgress?.detail ? (
            <p className="muted-copy">{searchProgress.detail}</p>
          ) : null}
          {adminSnapshot?.searchState?.latestError ? (
            <p className="admin-status-copy">{adminSnapshot.searchState.latestError}</p>
          ) : null}
        </section>

        <section className="admin-card">
          <h3>Origin Detection</h3>
          <SnapshotFacts entries={originDetectionFacts} />
          <p className="muted-copy">
            {locationDetection?.message ?? "No origin-detection status has been recorded yet."}
          </p>
        </section>

        <section className="admin-card">
          <h3>Latest Search Signals</h3>
          <SnapshotFacts entries={latestSignalFacts} />
          {latestSummary?.timingGuidance?.summary ? (
            <p className="muted-copy">{latestSummary.timingGuidance.summary}</p>
          ) : null}
          {latestSummary?.priceAlert?.summary ? (
            <p className="muted-copy">{latestSummary.priceAlert.summary}</p>
          ) : null}
          {latestSummary?.separateOneWayInsight?.summary ? (
            <p className="muted-copy">{latestSummary.separateOneWayInsight.summary}</p>
          ) : null}
        </section>

        <section className="admin-card">
          <h3>Environment Snapshot</h3>
          <pre className="admin-snapshot">{environmentSnapshot}</pre>
        </section>

        <section className="admin-card">
          <h3>Current UI State</h3>
          <pre className="admin-snapshot">
            {JSON.stringify(uiSnapshot ?? {}, null, 2)}
          </pre>
        </section>

        <section className="admin-card">
          <h3>Client Logs</h3>
          <div className="admin-log-list">
            {clientLogs.length === 0 ? (
              <p className="muted-copy">No client-side logs yet.</p>
            ) : (
              clientLogs.map((entry) => (
                <article key={entry.id} className={`admin-log admin-log--${entry.level}`}>
                  <header>
                    <strong>{entry.message}</strong>
                    <span>{formatTimestamp(entry.timestamp)}</span>
                  </header>
                  {entry.details ? <pre>{entry.details}</pre> : null}
                </article>
              ))
            )}
          </div>
        </section>

        <section className="admin-card">
          <h3>Server Logs</h3>
          <div className="admin-log-list">
            {serverLogs.length === 0 ? (
              <p className="muted-copy">No server logs available yet.</p>
            ) : (
              serverLogs.map((entry) => (
                <article key={entry.id} className={`admin-log admin-log--${entry.level}`}>
                  <header>
                    <strong>{entry.message}</strong>
                    <span>{formatTimestamp(entry.timestamp)}</span>
                  </header>
                  {entry.details ? <pre>{JSON.stringify(entry.details, null, 2)}</pre> : null}
                </article>
              ))
            )}
          </div>
        </section>
      </div>
    </aside>
  );
}
