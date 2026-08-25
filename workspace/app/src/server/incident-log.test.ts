import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ensureIncidentLogDirectory,
  INCIDENT_LOG_RETENTION_MS,
  writeIncidentLog,
  writeIncidentLogSafely,
} from "./incident-log";

const temporaryDirectories: string[] = [];

function createTemporaryDirectory(): string {
  const directoryPath = fs.mkdtempSync(
    path.join(os.tmpdir(), "cheapest-flight-picker-log-")
  );
  temporaryDirectories.push(directoryPath);
  return directoryPath;
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const directoryPath of temporaryDirectories.splice(0)) {
    fs.rmSync(directoryPath, {
      force: true,
      recursive: true
    });
  }
});

describe("ensureIncidentLogDirectory", () => {
  it("creates and returns the specified directory path", () => {
    const baseDirectory = createTemporaryDirectory();
    const targetDirectory = path.join(baseDirectory, "nested", "logs");

    expect(fs.existsSync(targetDirectory)).toBe(false);

    const result = ensureIncidentLogDirectory(targetDirectory);

    expect(result).toBe(targetDirectory);
    expect(fs.existsSync(targetDirectory)).toBe(true);
  });

  it("uses the default path based on runtime configuration if no path is provided", () => {
    const originalEnv = process.env.CHEAPEST_FLIGHT_PICKER_RUNTIME_DIR;
    const testRuntimeDir = createTemporaryDirectory();
    process.env.CHEAPEST_FLIGHT_PICKER_RUNTIME_DIR = testRuntimeDir;

    try {
      const result = ensureIncidentLogDirectory();

      expect(result).toBe(path.join(testRuntimeDir, "logs"));
      expect(fs.existsSync(result)).toBe(true);
    } finally {
      if (originalEnv === undefined) {
        delete process.env.CHEAPEST_FLIGHT_PICKER_RUNTIME_DIR;
      } else {
        process.env.CHEAPEST_FLIGHT_PICKER_RUNTIME_DIR = originalEnv;
      }
    }
  });
});

describe("writeIncidentLog", () => {
  it("writes a timestamped JSON incident file", () => {
    const directoryPath = createTemporaryDirectory();
    const timestamp = new Date("2026-03-25T21:45:30.123Z");

    const result = writeIncidentLog(
      {
        source: "server",
        level: "error",
        message: "POST /api/search failed",
        details: {
          route: "SEA -> JFK"
        }
      },
      {
        directoryPath,
        timestamp
      }
    );

    const files = fs.readdirSync(directoryPath);
    expect(files).toHaveLength(1);
    expect(files[0]).toContain("server-post-api-search-failed");

    const fileContents = JSON.parse(fs.readFileSync(result.filePath, "utf8")) as {
      source: string;
      level: string;
      message: string;
      details?: Record<string, unknown>;
    };

    expect(fileContents.source).toBe("server");
    expect(fileContents.level).toBe("error");
    expect(fileContents.message).toBe("POST /api/search failed");
    expect(fileContents.details?.route).toBe("SEA -> JFK");
  });

  it("prunes incident files older than the retention window", () => {
    const directoryPath = createTemporaryDirectory();
    const now = new Date("2026-06-27T12:00:00.000Z");
    const staleTimestamp = new Date(now.getTime() - INCIDENT_LOG_RETENTION_MS - 1000);

    writeIncidentLog(
      {
        source: "server",
        level: "error",
        message: "Old incident"
      },
      {
        directoryPath,
        timestamp: staleTimestamp
      }
    );

    const recentResult = writeIncidentLog(
      {
        source: "client",
        level: "error",
        message: "Fresh incident"
      },
      {
        directoryPath,
        timestamp: now
      }
    );

    const files = fs.readdirSync(directoryPath);
    expect(files).toHaveLength(1);
    expect(path.basename(recentResult.filePath)).toContain("fresh-incident");
    expect(files[0]).toContain("fresh-incident");
  });
});

describe("writeIncidentLogSafely", () => {
  it("returns incident entry and file path on success", () => {
    const directoryPath = createTemporaryDirectory();
    const timestamp = new Date("2026-03-25T21:45:30.123Z");

    const result = writeIncidentLogSafely(
      {
        source: "server",
        level: "info",
        message: "Safe incident test"
      },
      {
        directoryPath,
        timestamp
      }
    );

    expect(result).not.toBeNull();
    expect(result?.entry.message).toBe("Safe incident test");
    expect(fs.existsSync(result!.filePath)).toBe(true);
  });

  it("catches errors, logs to console.error, and returns null when writing fails", () => {
    const directoryPath = createTemporaryDirectory();
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const writeError = new Error("Disk full or write permission denied");
    vi.spyOn(fs, "writeFileSync").mockImplementation(() => {
      throw writeError;
    });

    const result = writeIncidentLogSafely(
      {
        source: "server",
        level: "error",
        message: "Failed write test"
      },
      {
        directoryPath
      }
    );

    expect(result).toBeNull();
    expect(consoleErrorSpy).toHaveBeenCalledWith("Failed to write incident log", writeError);
  });
});
