import http from "node:http";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import app from "./index";
import {
  appendServerLog,
  clearServerLogs,
  getServerLogs
} from "./admin-log";
import * as incidentLogModule from "./incident-log";

let server: http.Server;
let port: number;
const adminEnvNames = [
  "ADMIN_API_KEY",
  "ADMIN_KEY",
  "ADMIN_TOKEN",
  "ADMIN_SECRET"
] as const;
const initialAdminEnv = Object.fromEntries(
  adminEnvNames.map((name) => [name, process.env[name]])
);

beforeEach(() => {
  for (const name of adminEnvNames) {
    delete process.env[name];
  }
});

afterEach(() => {
  for (const name of adminEnvNames) {
    delete process.env[name];
    const value = initialAdminEnv[name];
    if (value !== undefined) {
      process.env[name] = value;
    }
  }
});

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const address = server.address();
      if (address && typeof address === "object") {
        port = address.port;
      }
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
});

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
      const spy = vi.spyOn(incidentLogModule, "writeIncidentLogSafely").mockImplementation(async () => null);

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
      const spy = vi.spyOn(incidentLogModule, "writeIncidentLogSafely").mockImplementation(async () => null);

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
      const spy = vi.spyOn(incidentLogModule, "writeIncidentLogSafely").mockImplementation(async () => null);

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

async function requestDeleteLogs(headers: Record<string, string> = {}): Promise<{ status: number; body: any }> {
  const response = await fetch(`http://localhost:${port}/api/admin/logs`, {
    method: "DELETE",
    headers
  });
  const body = await response.json();
  return { status: response.status, body };
}

describe("DELETE /api/admin/logs authentication", () => {
  it("rejects unauthenticated log deletion requests with status 401 when ADMIN_API_KEY is configured", async () => {
    process.env.ADMIN_API_KEY = "secret-key-123";

    try {
      appendServerLog("info", "Test log message");
      expect(getServerLogs().length).toBeGreaterThan(0);

      const response = await requestDeleteLogs();
      expect(response.status).toBe(401);
      expect(response.body).toEqual({ ok: false, error: "Unauthorized" });
      expect(getServerLogs().length).toBeGreaterThan(0);
    } finally {
      delete process.env.ADMIN_API_KEY;
    }
  });

  it("allows log deletion when valid x-admin-key authentication header is provided", async () => {
    process.env.ADMIN_API_KEY = "secret-key-123";

    try {
      appendServerLog("info", "Test log message");
      expect(getServerLogs().length).toBeGreaterThan(0);

      const response = await requestDeleteLogs({
        "x-admin-key": "secret-key-123"
      });
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ ok: true });
      expect(getServerLogs().length).toBe(0);
    } finally {
      delete process.env.ADMIN_API_KEY;
    }
  });

  it("allows log deletion when valid Bearer Authorization header is provided", async () => {
    process.env.ADMIN_API_KEY = "secret-key-123";

    try {
      appendServerLog("info", "Test log message");
      expect(getServerLogs().length).toBeGreaterThan(0);

      const response = await requestDeleteLogs({
        authorization: "Bearer secret-key-123"
      });
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ ok: true });
      expect(getServerLogs().length).toBe(0);
    } finally {
      delete process.env.ADMIN_API_KEY;
    }
  });

  it("fails closed when no admin key is configured", async () => {
    delete process.env.ADMIN_API_KEY;

    try {
      appendServerLog("info", "Test log message");
      expect(getServerLogs().length).toBeGreaterThan(0);

      const unauthResponse = await requestDeleteLogs();
      expect(unauthResponse.status).toBe(401);
      expect(unauthResponse.body).toEqual({
        ok: false,
        error: "Admin authentication is not configured"
      });

      const wrongKeyResponse = await requestDeleteLogs({ "x-admin-key": "wrong" });
      expect(wrongKeyResponse.status).toBe(401);
    } finally {
      delete process.env.ADMIN_API_KEY;
    }
  });

  it.each([
    ["ADMIN_KEY", "x-admin-key"],
    ["ADMIN_TOKEN", "x-admin-token"],
    ["ADMIN_SECRET", "x-admin-secret"],
    ["ADMIN_API_KEY", "x-api-key"]
  ])("accepts %s with its compatible header", async (envName, headerName) => {
    process.env[envName] = "secret-key-123";

    try {
      appendServerLog("info", "Test log message");
      const response = await requestDeleteLogs({ [headerName]: "secret-key-123" });
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ ok: true });
    } finally {
      delete process.env[envName];
    }
  });

  it("protects incident ingestion and accepts Bearer authentication", async () => {
    process.env.ADMIN_TOKEN = "secret-key-123";

    try {
      const unauthenticated = await fetch(`http://localhost:${port}/api/admin/incidents`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: "unauthorized" })
      });
      expect(unauthenticated.status).toBe(401);

      const authenticated = await fetch(`http://localhost:${port}/api/admin/incidents`, {
        method: "POST",
        headers: {
          authorization: "Bearer secret-key-123",
          "content-type": "application/json"
        },
        body: JSON.stringify({ message: "authorized" })
      });
      expect(authenticated.status).toBe(202);
      expect(await authenticated.json()).toEqual({ ok: true });
    } finally {
      delete process.env.ADMIN_TOKEN;
    }
  });
});
