import { afterEach, beforeEach, describe, expect, it } from "vitest";

import app from "./index";

describe("CORS configuration", () => {
  const originalEnv = process.env.ALLOWED_ORIGINS;

  beforeEach(() => {
    delete process.env.ALLOWED_ORIGINS;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.ALLOWED_ORIGINS = originalEnv;
    } else {
      delete process.env.ALLOWED_ORIGINS;
    }
  });

  it("allows requests from local default origins", async () => {
    const server = app.listen(0);
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;

    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
        headers: {
          Origin: "http://localhost:5173"
        }
      });
      expect(response.status).toBe(200);
      expect(response.headers.get("access-control-allow-origin")).toBe(
        "http://localhost:5173"
      );
    } finally {
      server.close();
    }
  });

  it("allows launcher-selected localhost ports outside the default list", async () => {
    const server = app.listen(0);
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;

    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
        headers: {
          Origin: "http://localhost:8788"
        }
      });
      expect(response.status).toBe(200);
      expect(response.headers.get("access-control-allow-origin")).toBe(
        "http://localhost:8788"
      );
    } finally {
      server.close();
    }
  });

  it("allows requests without an origin header (same-origin / CLI)", async () => {
    const server = app.listen(0);
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;

    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      expect(response.status).toBe(200);
    } finally {
      server.close();
    }
  });

  it("rejects requests from unallowed origins", async () => {
    const server = app.listen(0);
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;

    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
        headers: {
          Origin: "http://malicious-site.com"
        }
      });
      expect(response.status).toBe(200);
      expect(response.headers.get("access-control-allow-origin")).toBeNull();
    } finally {
      server.close();
    }
  });

  it("respects custom ALLOWED_ORIGINS environment variable", async () => {
    process.env.ALLOWED_ORIGINS = "https://myapp.com, https://another.com";
    const server = app.listen(0);
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;

    try {
      const responseAllowed = await fetch(`http://127.0.0.1:${port}/api/health`, {
        headers: {
          Origin: "https://myapp.com"
        }
      });
      expect(responseAllowed.status).toBe(200);
      expect(responseAllowed.headers.get("access-control-allow-origin")).toBe(
        "https://myapp.com"
      );

      const responseBlocked = await fetch(`http://127.0.0.1:${port}/api/health`, {
        headers: {
          Origin: "http://localhost:5173"
        }
      });
      expect(responseBlocked.status).toBe(200);
      expect(responseBlocked.headers.get("access-control-allow-origin")).toBeNull();
    } finally {
      server.close();
    }
  });
});
