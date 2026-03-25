import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { writeIncidentLog } from "./incident-log";

const temporaryDirectories: string[] = [];

function createTemporaryDirectory(): string {
  const directoryPath = fs.mkdtempSync(
    path.join(os.tmpdir(), "cheapest-flight-picker-log-")
  );
  temporaryDirectories.push(directoryPath);
  return directoryPath;
}

afterEach(() => {
  for (const directoryPath of temporaryDirectories.splice(0)) {
    fs.rmSync(directoryPath, {
      force: true,
      recursive: true
    });
  }
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
});
