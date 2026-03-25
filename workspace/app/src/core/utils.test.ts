import { describe, expect, it } from "vitest";

import {
  clampTimeWindow,
  combineBookingSources,
  combineTwoOneWays,
  stopFilterToGoogleValue
} from "./utils";

describe("core utils", () => {
  it("normalizes reversed time windows", () => {
    expect(clampTimeWindow({ from: 20, to: 6 })).toEqual({
      from: 6,
      to: 20
    });
  });

  it("treats 0 to 24 as unrestricted and maps end-of-day 24 to 23", () => {
    expect(clampTimeWindow({ from: 0, to: 24 })).toBeUndefined();
    expect(clampTimeWindow({ from: 6, to: 24 })).toEqual({
      from: 6,
      to: 23
    });
  });

  it("converts stop filters to Google values", () => {
    expect(stopFilterToGoogleValue("any")).toBe(0);
    expect(stopFilterToGoogleValue("nonstop")).toBe(1);
    expect(stopFilterToGoogleValue("max_1_stop")).toBe(2);
    expect(stopFilterToGoogleValue("max_2_stops")).toBe(3);
  });

  it("combines two one-way options into one round-trip style result", () => {
    const outbound = {
      bookingSource: {
        type: "direct_airline" as const,
        label: "Direct with Test Air",
        sellerName: "Test Air",
        detected: true
      },
      currency: "USD" as const,
      slices: [],
      source: "google_one_way" as const,
      totalPrice: 120
    };
    const inbound = {
      bookingSource: {
        type: "ota" as const,
        label: "OTA: SmartFares",
        sellerName: "SmartFares",
        detected: true
      },
      currency: "USD" as const,
      slices: [],
      source: "google_one_way" as const,
      totalPrice: 135
    };

    const combined = combineTwoOneWays(
      outbound,
      inbound,
      "2026-04-15",
      "2026-04-21"
    );

    expect(combined.totalPrice).toBe(255);
    expect(combined.source).toBe("two_one_way_combo");
    expect(combined.bookingSource.type).toBe("mixed");
  });

  it("combines direct-airline seller labels across slices", () => {
    const combined = combineBookingSources([
      {
        type: "direct_airline",
        label: "Direct with Alaska",
        sellerName: "Alaska",
        detected: true
      },
      {
        type: "direct_airline",
        label: "Direct with Alaska",
        sellerName: "Alaska",
        detected: true
      }
    ]);

    expect(combined).toEqual({
      type: "direct_airline",
      label: "Direct with Alaska",
      sellerName: "Alaska",
      detected: true
    });
  });
});
