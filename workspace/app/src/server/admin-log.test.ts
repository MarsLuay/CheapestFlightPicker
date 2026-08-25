import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  appendServerLog,
  clearServerLogs,
  getServerLogs
} from "./admin-log";
import * as incidentLogModule from "./incident-log";

describe("admin-log", () => {
  beforeEach(() => {
    clearServerLogs();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    clearServerLogs();
    vi.restoreAllMocks();
  });

  describe("appendServerLog", () => {
    it("appends server log entry with formatted fields", () => {
      appendServerLog("info", "Server started", { port: 3000 });

      const logs = getServerLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        level: "info",
        message: "Server started",
        details: { port: 3000 }
      });
      expect(typeof logs[0].id).toBe("string");
      expect(logs[0].id).toMatch(/^\d+-[a-z0-9]+$/);
      expect(typeof logs[0].timestamp).toBe("string");
      expect(new Date(logs[0].timestamp).toISOString()).toBe(logs[0].timestamp);
    });

    it("prepends logs so that newest entries appear first", () => {
      appendServerLog("info", "First entry");
      appendServerLog("error", "Second entry");

      const logs = getServerLogs();
      expect(logs).toHaveLength(2);
      expect(logs[0].message).toBe("Second entry");
      expect(logs[1].message).toBe("First entry");
    });

    it("caps logs at MAX_SERVER_LOGS (200 entries)", () => {
      for (let i = 0; i < 210; i++) {
        appendServerLog("info", `Log ${i}`);
      }

      const logs = getServerLogs();
      expect(logs).toHaveLength(200);
      expect(logs[0].message).toBe("Log 209");
      expect(logs[199].message).toBe("Log 10");
    });

    it("persists log via writeIncidentLogSafely when persist option is true with default source", () => {
      const spy = vi.spyOn(incidentLogModule, "writeIncidentLogSafely").mockImplementation(() => {});

      appendServerLog("error", "Database connection lost", { db: "main" }, { persist: true });

      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith({
        source: "server",
        level: "error",
        message: "Database connection lost",
        details: { db: "main" }
      });
    });

    it("persists log via writeIncidentLogSafely with custom source", () => {
      const spy = vi.spyOn(incidentLogModule, "writeIncidentLogSafely").mockImplementation(() => {});

      appendServerLog("info", "Client search request", undefined, { persist: true, source: "client" });

      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith({
        source: "client",
        level: "info",
        message: "Client search request",
        details: undefined
      });
    });

    it("does not persist log when persist option is omitted or false", () => {
      const spy = vi.spyOn(incidentLogModule, "writeIncidentLogSafely").mockImplementation(() => {});

      appendServerLog("info", "Non-persisted log", undefined, { persist: false });
      appendServerLog("info", "Another non-persisted log");

      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe("getServerLogs and clearServerLogs", () => {
    it("returns a shallow copy of serverLogs array", () => {
      appendServerLog("info", "Test log");
      const logs = getServerLogs();
      logs.pop();

      expect(getServerLogs()).toHaveLength(1);
    });

    it("clears all server log entries", () => {
      appendServerLog("info", "Log 1");
      appendServerLog("error", "Log 2");
      expect(getServerLogs()).toHaveLength(2);

      clearServerLogs();
      expect(getServerLogs()).toHaveLength(0);
    });
  });
});
