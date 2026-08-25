import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import app from "./index";

describe("Admin Logs Authentication", () => {
  let server: ReturnType<typeof app.listen>;
  let baseUrl: string;
  const originalEnv = { ...process.env };

  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const address = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    process.env = originalEnv;
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  beforeEach(() => {
    delete process.env.ADMIN_API_KEY;
    delete process.env.ADMIN_KEY;
    delete process.env.ADMIN_TOKEN;
  });

  it("returns 401 Unauthorized when no admin key is configured on server", async () => {
    const res = await fetch(`${baseUrl}/api/admin/logs`);
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string; ok: boolean };
    expect(body.ok).toBe(false);
    expect(body.error).toContain("Admin API key not configured");
  });

  it("returns 401 Unauthorized when request lacks admin key header", async () => {
    process.env.ADMIN_API_KEY = "secret123";

    const res = await fetch(`${baseUrl}/api/admin/logs`);
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string; ok: boolean };
    expect(body.ok).toBe(false);
    expect(body.error).toContain("Invalid or missing admin key");
  });

  it("returns 401 Unauthorized when request provides wrong admin key", async () => {
    process.env.ADMIN_API_KEY = "secret123";

    const res = await fetch(`${baseUrl}/api/admin/logs`, {
      headers: { "x-admin-key": "wrongkey" }
    });
    expect(res.status).toBe(401);
  });

  it("returns 200 OK for GET /api/admin/logs with valid x-admin-key header", async () => {
    process.env.ADMIN_API_KEY = "secret123";

    const res = await fetch(`${baseUrl}/api/admin/logs`, {
      headers: { "x-admin-key": "secret123" }
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { logs: unknown[] };
    expect(Array.isArray(body.logs)).toBe(true);
  });

  it("returns 200 OK for GET /api/admin/logs with Authorization Bearer header", async () => {
    process.env.ADMIN_KEY = "secret456";

    const res = await fetch(`${baseUrl}/api/admin/logs`, {
      headers: { Authorization: "Bearer secret456" }
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { logs: unknown[] };
    expect(Array.isArray(body.logs)).toBe(true);
  });

  it("returns 200 OK for GET /api/admin/logs with x-api-key header", async () => {
    process.env.ADMIN_TOKEN = "secret789";

    const res = await fetch(`${baseUrl}/api/admin/logs`, {
      headers: { "x-api-key": "secret789" }
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { logs: unknown[] };
    expect(Array.isArray(body.logs)).toBe(true);
  });

  it("returns 401 Unauthorized for DELETE /api/admin/logs without auth", async () => {
    process.env.ADMIN_API_KEY = "secret123";

    const res = await fetch(`${baseUrl}/api/admin/logs`, {
      method: "DELETE"
    });
    expect(res.status).toBe(401);
  });

  it("returns 200 OK for DELETE /api/admin/logs with valid auth", async () => {
    process.env.ADMIN_API_KEY = "secret123";

    const res = await fetch(`${baseUrl}/api/admin/logs`, {
      method: "DELETE",
      headers: { "x-admin-key": "secret123" }
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });
});
