import http from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import app from "./index";
import { appendServerLog, getServerLogs } from "./admin-log";

let server: http.Server;
let port: number;

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const addr = server.address();
      if (addr && typeof addr === "object") {
        port = addr.port;
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
    const originalEnv = process.env.ADMIN_API_KEY;
    process.env.ADMIN_API_KEY = "secret-key-123";

    try {
      appendServerLog("info", "Test log message");
      expect(getServerLogs().length).toBeGreaterThan(0);

      const response = await requestDeleteLogs();
      expect(response.status).toBe(401);
      expect(response.body).toEqual({ ok: false, error: "Unauthorized" });
      expect(getServerLogs().length).toBeGreaterThan(0);
    } finally {
      if (originalEnv === undefined) {
        delete process.env.ADMIN_API_KEY;
      } else {
        process.env.ADMIN_API_KEY = originalEnv;
      }
    }
  });

  it("allows log deletion when valid x-admin-key authentication header is provided", async () => {
    const originalEnv = process.env.ADMIN_API_KEY;
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
      if (originalEnv === undefined) {
        delete process.env.ADMIN_API_KEY;
      } else {
        process.env.ADMIN_API_KEY = originalEnv;
      }
    }
  });

  it("allows log deletion when valid Bearer Authorization header is provided", async () => {
    const originalEnv = process.env.ADMIN_API_KEY;
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
      if (originalEnv === undefined) {
        delete process.env.ADMIN_API_KEY;
      } else {
        process.env.ADMIN_API_KEY = originalEnv;
      }
    }
  });

  it("uses default key 'admin' when ADMIN_API_KEY is not set", async () => {
    const originalEnv = process.env.ADMIN_API_KEY;
    delete process.env.ADMIN_API_KEY;

    try {
      appendServerLog("info", "Test log message");
      expect(getServerLogs().length).toBeGreaterThan(0);

      const unauthResponse = await requestDeleteLogs();
      expect(unauthResponse.status).toBe(401);
      expect(unauthResponse.body).toEqual({ ok: false, error: "Unauthorized" });

      const wrongKeyResponse = await requestDeleteLogs({ "x-admin-key": "wrong" });
      expect(wrongKeyResponse.status).toBe(401);

      const authResponse = await requestDeleteLogs({ "x-admin-key": "admin" });
      expect(authResponse.status).toBe(200);
      expect(authResponse.body).toEqual({ ok: true });
      expect(getServerLogs().length).toBe(0);
    } finally {
      if (originalEnv !== undefined) {
        process.env.ADMIN_API_KEY = originalEnv;
      }
    }
  });
});
