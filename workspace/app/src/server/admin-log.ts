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

export function appendServerLog(
  level: ServerLogLevel,
  message: string,
  details?: Record<string, unknown>
): void {
  serverLogs.unshift({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    level,
    message,
    details
  });

  if (serverLogs.length > MAX_SERVER_LOGS) {
    serverLogs.length = MAX_SERVER_LOGS;
  }
}

export function getServerLogs(): ServerLogEntry[] {
  return [...serverLogs];
}

export function clearServerLogs(): void {
  serverLogs.length = 0;
}
