import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { fallbackErrorHandler } from "./index";

describe("fallbackErrorHandler", () => {
  it("should ignore requests that do not start with /api by passing the error to next", async () => {
    const app = express();
    app.get("/not-api", (_req, _res, next) => {
      next(new Error("Test error"));
    });
    app.use(fallbackErrorHandler);
    // Add a final error handler to catch the passed error
    app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      res.status(500).json({ errorCaught: err.message });
    });

    const response = await request(app).get("/not-api");
    expect(response.status).toBe(500);
    expect(response.body).toEqual({ errorCaught: "Test error" });
  });

  it("should ignore requests where headers are already sent by passing the error to next", async () => {
    const app = express();
    app.get("/api/test", (_req, res, next) => {
      res.send("Already sent");
      // This error should go to the next handler because headers are sent
      next(new Error("Late error"));
    });
    app.use(fallbackErrorHandler);
    app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      // It's too late to send headers here, but Express will destroy the socket or we can just observe it
      // Actually with supertest, we just see the original body. The error is logged or unhandled.
      // To test this purely, we can just intercept the error.
    });

    const response = await request(app).get("/api/test");
    expect(response.status).toBe(200);
    expect(response.text).toBe("Already sent");
  });

  it("should handle standard Error and return 400 with the error message", async () => {
    const app = express();
    app.get("/api/test", (_req, _res, next) => {
      next(new Error("Standard test error"));
    });
    app.use(fallbackErrorHandler);

    const response = await request(app).get("/api/test");
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "Standard test error", ok: false });
  });

  it("should handle error without message and fallback to 'Request failed'", async () => {
    const app = express();
    app.get("/api/test", (_req, _res, next) => {
      next(new Error("  ")); // blank message
    });
    app.use(fallbackErrorHandler);

    const response = await request(app).get("/api/test");
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "Request failed", ok: false });
  });

  it("should respect status code from error.status", async () => {
    const app = express();
    app.get("/api/test", (_req, _res, next) => {
      const err: any = new Error("Not found");
      err.status = 404;
      next(err);
    });
    app.use(fallbackErrorHandler);

    const response = await request(app).get("/api/test");
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "Not found", ok: false });
  });

  it("should respect status code from error.statusCode", async () => {
    const app = express();
    app.get("/api/test", (_req, _res, next) => {
      const err: any = new Error("Unprocessable");
      err.statusCode = 422;
      next(err);
    });
    app.use(fallbackErrorHandler);

    const response = await request(app).get("/api/test");
    expect(response.status).toBe(422);
    expect(response.body).toEqual({ error: "Unprocessable", ok: false });
  });

  it("should clamp status code to minimum 400", async () => {
    const app = express();
    app.get("/api/test", (_req, _res, next) => {
      const err: any = new Error("Weird status");
      err.status = 200; // less than 400
      next(err);
    });
    app.use(fallbackErrorHandler);

    const response = await request(app).get("/api/test");
    expect(response.status).toBe(400); // Should be clamped to 400
    expect(response.body).toEqual({ error: "Weird status", ok: false });
  });

  it("should handle non-Error objects (e.g. string throwing)", async () => {
    const app = express();
    app.get("/api/test", (_req, _res, next) => {
      next("Just a string error");
    });
    app.use(fallbackErrorHandler);

    const response = await request(app).get("/api/test");
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "Request failed", ok: false });
  });
});
