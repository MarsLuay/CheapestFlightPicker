import { describe, expect, it, vi, afterEach } from "vitest";
import request from "supertest";

import app from "./index";

describe("Express App Configuration", () => {
  describe("GET /api/health", () => {
    it("returns 200 OK and expected JSON", async () => {
      const response = await request(app).get("/api/health");
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ ok: true });
    });
  });

  describe("CORS middleware", () => {
    it("allows standard local origins", async () => {
      const response = await request(app)
        .get("/api/health")
        .set("Origin", "http://localhost:5173");
      expect(response.status).toBe(200);
      expect(response.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    });

    it("does not allow unapproved origins without failing the request", async () => {
      const response = await request(app)
        .get("/api/health")
        .set("Origin", "http://malicious-site.com");
      expect(response.status).toBe(200);
      expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    });
  });

  describe("Frontend Rate Limiting", () => {
    it("does not rate limit API routes", async () => {
      const response = await request(app).get("/api/health");
      expect(response.status).toBe(200);
      expect(response.headers["ratelimit-policy"]).toBeUndefined();
      expect(response.headers["ratelimit"]).toBeUndefined();
    });

    it("applies rate limiting to non-API routes", async () => {
      // The frontendRateLimit middleware uses draft-8 standard headers.
      // So we expect "ratelimit-policy" and "ratelimit" instead of legacy X-RateLimit headers.
      const response = await request(app).get("/some-non-api-route");
      expect(response.headers["ratelimit-policy"]).toBeDefined();
      expect(response.headers["ratelimit"]).toBeDefined();
      expect(response.headers["ratelimit-policy"]).toContain("240");
    });
  });

  describe("Error Handling Middleware", () => {
    it("handles JSON parsing errors", async () => {
      const response = await request(app)
        .post("/api/search")
        .set("Content-Type", "application/json")
        .send("{ bad json }");

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty("error");
      expect(response.body).toHaveProperty("ok", false);
    });
  });
});
