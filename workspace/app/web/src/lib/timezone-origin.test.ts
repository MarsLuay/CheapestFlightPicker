import { describe, expect, it } from "vitest";

import { inferOriginFromTimeZone } from "./timezone-origin";

describe("inferOriginFromTimeZone", () => {
  it("maps a saved broad timezone region to a fallback airport", () => {
    expect(inferOriginFromTimeZone("America/Los_Angeles")).toEqual({
      origin: "LAX",
      regionLabel: "Pacific Time",
      timeZone: "America/Los_Angeles"
    });
    expect(inferOriginFromTimeZone("America/Chicago")).toEqual({
      origin: "ORD",
      regionLabel: "Central Time",
      timeZone: "America/Chicago"
    });
    expect(inferOriginFromTimeZone("America/New_York")).toEqual({
      origin: "JFK",
      regionLabel: "Eastern Time",
      timeZone: "America/New_York"
    });
  });

  it("returns null for unmapped time zones", () => {
    expect(inferOriginFromTimeZone("Europe/Paris")).toBeNull();
    expect(inferOriginFromTimeZone(null)).toBeNull();
  });
});
