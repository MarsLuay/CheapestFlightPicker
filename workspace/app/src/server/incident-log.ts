import fs from "node:fs";
import path from "node:path";

import { resolveAppPath } from "../core/project-paths";

export type IncidentLogSource = "server" | "client" | "process";

export type IncidentLogLevel = "info" | "warn" | "error";

export type IncidentLogEntry = {
  id: string;
  timestamp: string;
  source: IncidentLogSource;
  level: IncidentLogLevel;
  message: string;
  details?: Record<string, unknown>;
};

type WriteIncidentLogOptions = {
  directoryPath?: string;
  timestamp?: Date;
};

function buildIncidentId(timestamp: Date): string {
  return `${timestamp.getTime()}-${Math.random().toString(36).slice(2, 8)}`;
}

function sanitizeFileSegment(value: string): string {
  const sanitized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  return sanitized || "incident";
}

function getIncidentLogDirectory(directoryPath?: string): string {
  const resolvedDirectory = directoryPath ?? resolveAppPath("logs");
  fs.mkdirSync(resolvedDirectory, { recursive: true });
  return resolvedDirectory;
}

function buildIncidentLogFileName(
  timestamp: Date,
  source: IncidentLogSource,
  message: string
): string {
  const timestampSegment = timestamp.toISOString().replace(/[:.]/g, "-");
  return `${timestampSegment}-${source}-${sanitizeFileSegment(message)}.json`;
}

export function ensureIncidentLogDirectory(directoryPath?: string): string {
  return getIncidentLogDirectory(directoryPath);
}

export function writeIncidentLog(
  input: Omit<IncidentLogEntry, "id" | "timestamp">,
  options?: WriteIncidentLogOptions
): { entry: IncidentLogEntry; filePath: string } {
  const timestamp = options?.timestamp ?? new Date();
  const entry: IncidentLogEntry = {
    id: buildIncidentId(timestamp),
    timestamp: timestamp.toISOString(),
    ...input
  };
  const directoryPath = getIncidentLogDirectory(options?.directoryPath);
  const filePath = path.join(
    directoryPath,
    buildIncidentLogFileName(timestamp, entry.source, entry.message)
  );

  fs.writeFileSync(filePath, `${JSON.stringify(entry, null, 2)}\n`, "utf8");

  return { entry, filePath };
}

export function writeIncidentLogSafely(
  input: Omit<IncidentLogEntry, "id" | "timestamp">,
  options?: WriteIncidentLogOptions
): { entry: IncidentLogEntry; filePath: string } | null {
  try {
    return writeIncidentLog(input, options);
  } catch (error) {
    console.error("Failed to write incident log", error);
    return null;
  }
}
