import { describe, expect, it, beforeEach, afterEach } from "vitest";
import express from "express";
import http from "node:http";
import app from "./index";

describe("Admin authentication middleware", () => {
  const originalAdminToken = process.env.ADMIN_TOKEN;
  const originalAdminSecret = process.env.ADMIN_SECRET;
  let server: http.Server;
  let baseUrl: string;

  beforeEach(async () => {
    delete process.env.ADMIN_TOKEN;
    delete process.env.ADMIN_SECRET;

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address();
        if (addr && typeof addr === "object") {
          baseUrl = `http://localhost:${addr.port}`;
        }
        resolve();
      });
    });
  });

  afterEach(async () => {
    if (originalAdminToken !== undefined) {
      process.env.ADMIN_TOKEN = originalAdminToken;
    } else {
      delete process.env.ADMIN_TOKEN;
    }

    if (originalAdminSecret !== undefined) {
      process.env.ADMIN_SECRET = originalAdminSecret;
    } else {
      delete process.env.ADMIN_SECRET;
    }

    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it("allows requests when ADMIN_TOKEN is not configured", async () => {
    const res = await fetch(`${baseUrl}/api/admin/incidents`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Test incident" })
    });

    expect(res.status).toBe(202);
    const data = await res.json();
    expect(data).toEqual({ ok: true });
  });

  it("rejects unauthenticated requests when ADMIN_TOKEN is configured", async () => {
    process.env.ADMIN_TOKEN = "secret123";

    const res = await fetch(`${baseUrl}/api/admin/incidents`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Spoofed incident" })
    });

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.error).toMatch(/Unauthorized/i);
  });

  it("rejects requests with incorrect token when ADMIN_TOKEN is configured", async () => {
    process.env.ADMIN_TOKEN = "secret123";

    const res = await fetch(`${baseUrl}/api/admin/incidents`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-admin-token": "wrongtoken"
      },
      body: JSON.stringify({ message: "Spoofed incident" })
    });

    expect(res.status).toBe(401);
  });

  it("accepts requests with valid x-admin-token header", async () => {
    process.env.ADMIN_TOKEN = "secret123";

    const res = await fetch(`${baseUrl}/api/admin/incidents`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-admin-token": "secret123"
      },
      body: JSON.stringify({ message: "Legitimate incident" })
    });

    expect(res.status).toBe(202);
    const data = await res.json();
    expect(data).toEqual({ ok: true });
  });

  it("accepts requests with valid Authorization Bearer header", async () => {
    process.env.ADMIN_TOKEN = "secret123";

    const res = await fetch(`${baseUrl}/api/admin/incidents`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer secret123"
      },
      body: JSON.stringify({ message: "Legitimate incident" })
    });

    expect(res.status).toBe(202);
    const data = await res.json();
    expect(data).toEqual({ ok: true });
  });

  it("protects GET and DELETE /api/admin/logs when ADMIN_TOKEN is set", async () => {
    process.env.ADMIN_TOKEN = "secret123";

    const getRes = await fetch(`${baseUrl}/api/admin/logs`);
    expect(getRes.status).toBe(401);

    const deleteRes = await fetch(`${baseUrl}/api/admin/logs`, { method: "DELETE" });
    expect(deleteRes.status).toBe(401);

    const authGetRes = await fetch(`${baseUrl}/api/admin/logs`, {
      headers: { "x-admin-token": "secret123" }
    });
    expect(authGetRes.status).toBe(200);
  });
});
