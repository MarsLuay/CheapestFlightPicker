import { useSyncExternalStore } from "react";

export type ClientLogLevel = "info" | "warn" | "error";

export type ClientLogEntry = {
  id: string;
  timestamp: string;
  level: ClientLogLevel;
  message: string;
  details?: string;
};

const MAX_CLIENT_LOGS = 200;
const clientLogs: ClientLogEntry[] = [];
const subscribers = new Set<() => void>();
let attachedGlobalHandlers = false;

function emitChange() {
  for (const subscriber of subscribers) {
    subscriber();
  }
}

export function addClientLog(
  level: ClientLogLevel,
  message: string,
  details?: string
): void {
  clientLogs.unshift({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    level,
    message,
    details
  });

  if (clientLogs.length > MAX_CLIENT_LOGS) {
    clientLogs.length = MAX_CLIENT_LOGS;
  }

  emitChange();
}

export function clearClientLogs(): void {
  clientLogs.length = 0;
  emitChange();
}

function subscribe(onStoreChange: () => void): () => void {
  subscribers.add(onStoreChange);
  return () => {
    subscribers.delete(onStoreChange);
  };
}

function getSnapshot(): ClientLogEntry[] {
  return clientLogs;
}

export function useClientLogs(): ClientLogEntry[] {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function attachGlobalClientLogHandlers(): void {
  if (attachedGlobalHandlers || typeof window === "undefined") {
    return;
  }

  attachedGlobalHandlers = true;

  window.addEventListener("error", (event) => {
    addClientLog(
      "error",
      event.message || "Window error",
      event.error instanceof Error ? event.error.stack : undefined
    );
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason =
      event.reason instanceof Error
        ? event.reason.stack ?? event.reason.message
        : String(event.reason);

    addClientLog("error", "Unhandled promise rejection", reason);
  });
}
