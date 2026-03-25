import {
  type IncidentLogSource,
  writeIncidentLogSafely
} from "./incident-log";

type ServerLogLevel = "info" | "error";

export type ServerLogEntry = {
  id: string;
  timestamp: string;
  level: ServerLogLevel;
  message: string;
  details?: Record<string, unknown>;
};

const MAX_SERVER_LOGS = 200;
const serverLogs: ServerLogEntry[] = [];

type AppendServerLogOptions = {
  persist?: boolean;
  source?: IncidentLogSource;
};

export function appendServerLog(
  level: ServerLogLevel,
  message: string,
  details?: Record<string, unknown>,
  options?: AppendServerLogOptions
): void {
  const entry: ServerLogEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    level,
    message,
    details
  };

  serverLogs.unshift(entry);

  if (serverLogs.length > MAX_SERVER_LOGS) {
    serverLogs.length = MAX_SERVER_LOGS;
  }

  if (options?.persist) {
    writeIncidentLogSafely({
      source: options.source ?? "server",
      level,
      message,
      details
    });
  }
}

export function getServerLogs(): ServerLogEntry[] {
  return [...serverLogs];
}

export function clearServerLogs(): void {
  serverLogs.length = 0;
}
