import type { ClientLogEntry } from "../../lib/admin-log";
import type { ServerLogEntry } from "../../lib/types";

export function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "short",
    timeStyle: "medium"
  }).format(new Date(value));
}

export function toHumanLabel(value: string | null | undefined): string {
  if (!value) {
    return "n/a";
  }

  return value
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

export function formatClientLogDetails(entry: ClientLogEntry): string {
  return entry.details ?? "";
}

export function formatServerLogDetails(entry: ServerLogEntry): string {
  return entry.details ? JSON.stringify(entry.details, null, 2) : "";
}

export function formatLogBlock(
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

export function buildEnvironmentSnapshot(
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

export function buildDiagnosticsReport(
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

export async function copyTextToClipboard(text: string): Promise<void> {
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
