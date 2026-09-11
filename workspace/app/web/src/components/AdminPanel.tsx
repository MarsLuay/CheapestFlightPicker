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
  useClientLogs
} from "../lib/admin-log";
import type { ServerLogEntry } from "../lib/types";
import type { AdminPanelProps, AdminUiSnapshot } from "./admin/types";
import { formatTimestamp, formatLogBlock, buildEnvironmentSnapshot, buildDiagnosticsReport, copyTextToClipboard, toHumanLabel } from "./admin/utils";
import { FlightControlsView } from "./admin/FlightControlsView";
import { OriginDetectionView } from "./admin/OriginDetectionView";
import { LatestSearchSignalsView } from "./admin/LatestSearchSignalsView";

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
          <button
            type="button"
            className="admin-button"
            aria-label="Refresh logs"
            onClick={() => void refreshPanel()}
          >
            Refresh logs
          </button>
          <button
            type="button"
            className="admin-button"
            aria-label="Copy report"
            onClick={() => void handleCopy("diagnostics report", diagnosticsReport)}
          >
            Copy report
          </button>
          <button
            type="button"
            className="admin-button"
            aria-label="Copy client logs"
            onClick={() => void handleCopy("client logs", clientLogText)}
          >
            Copy client logs
          </button>
          <button
            type="button"
            className="admin-button"
            aria-label="Copy server logs"
            onClick={() => void handleCopy("server logs", serverLogText)}
          >
            Copy server logs
          </button>
          <button
            type="button"
            className="admin-button"
            aria-label="Clear client logs"
            onClick={clearClientLogs}
          >
            Clear client logs
          </button>
          <button
            type="button"
            className="admin-button"
            aria-label="Clear server logs"
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
          <button
            type="button"
            className="admin-button"
            aria-label="Close admin panel"
            onClick={() => setIsOpen(false)}
          >
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
        <FlightControlsView adminSnapshot={adminSnapshot} searchProgress={searchProgress} />

        <OriginDetectionView locationDetection={locationDetection} />

        <LatestSearchSignalsView latestSummary={latestSummary} />

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
