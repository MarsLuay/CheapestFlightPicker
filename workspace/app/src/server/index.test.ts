import { describe, it, expect } from "vitest";
import { buildClientIncident } from "./index";

describe("buildClientIncident", () => {
  it("should return a generic incident when input is null", () => {
    const result = buildClientIncident(null);
    expect(result).toEqual({
      message: "Client incident",
      details: {
        payloadType: "null"
      }
    });
  });

  it("should return a generic incident when input is not an object", () => {
    const result = buildClientIncident("some string");
    expect(result).toEqual({
      message: "Client incident",
      details: {
        payloadType: "string"
      }
    });

    const result2 = buildClientIncident(123);
    expect(result2).toEqual({
      message: "Client incident",
      details: {
        payloadType: "number"
      }
    });
  });

  it("should extract a custom message if provided", () => {
    const result = buildClientIncident({ message: "Custom error occurred" });
    expect(result.message).toBe("Custom error occurred");
  });

  it("should trim the custom message", () => {
    const result = buildClientIncident({ message: "  Custom error occurred  " });
    expect(result.message).toBe("Custom error occurred");
  });

  it("should use a generic message if custom message is empty after trimming", () => {
    const result = buildClientIncident({ message: "   " });
    expect(result.message).toBe("Client incident");
  });

  it("should extract standard log levels (info, warn, error)", () => {
    expect(buildClientIncident({ level: "info" }).details.level).toBe("info");
    expect(buildClientIncident({ level: "warn" }).details.level).toBe("warn");
    expect(buildClientIncident({ level: "error" }).details.level).toBe("error");
  });

  it("should ignore invalid log levels", () => {
    const result = buildClientIncident({ level: "debug" });
    expect(result.details.level).toBeUndefined();
  });

  it("should extract reportedAt from timestamp string", () => {
    const result = buildClientIncident({ timestamp: "2023-01-01T12:00:00Z" });
    expect(result.details.reportedAt).toBe("2023-01-01T12:00:00Z");
  });

  it("should extract pageUrl", () => {
    const result = buildClientIncident({ pageUrl: "https://example.com/flights" });
    expect(result.details.pageUrl).toBe("https://example.com/flights");
  });

  it("should extract userAgent", () => {
    const result = buildClientIncident({ userAgent: "Mozilla/5.0" });
    expect(result.details.userAgent).toBe("Mozilla/5.0");
  });

  it("should extract string details", () => {
    const result = buildClientIncident({ details: "Some additional info" });
    expect(result.details.details).toBe("Some additional info");
  });

  it("should extract object details", () => {
    const detailsObject = { key: "value", errorId: 123 };
    const result = buildClientIncident({ details: detailsObject });
    expect(result.details.details).toEqual(detailsObject);
  });

  it("should parse a fully populated valid payload", () => {
    const input = {
      message: "Flight search failed",
      level: "error",
      timestamp: "2023-01-01T12:00:00Z",
      pageUrl: "https://example.com",
      userAgent: "TestAgent",
      details: { reason: "timeout" },
      extraField: "should be ignored"
    };

    const result = buildClientIncident(input);

    expect(result).toEqual({
      message: "Flight search failed",
      details: {
        level: "error",
        reportedAt: "2023-01-01T12:00:00Z",
        pageUrl: "https://example.com",
        userAgent: "TestAgent",
        details: { reason: "timeout" }
      }
    });
  });
});
