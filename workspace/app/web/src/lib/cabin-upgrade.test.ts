import { describe, expect, it } from "vitest";

import {
  buildHigherCabinBoxTitle,
  buildHigherCabinSearchRequests,
  getCabinLabel,
  getHigherCabinClasses,
  getNextCabinClass,
  pickCheaperFlightOption
} from "./cabin-upgrade";
import type { FlightOption, SearchRequest } from "./types";

function buildRequest(
  cabinClass: SearchRequest["cabinClass"] = "economy"
): SearchRequest {
  return {
    tripType: "round_trip",
    origin: "SEA",
    destination: "JFK",
    departureDateFrom: "2026-06-01",
    departureDateTo: "2026-06-05",
    returnDateFrom: "2026-06-08",
    returnDateTo: "2026-06-12",
    minimumTripDays: 3,
    maximumTripDays: 10,
    departureTimeWindow: { from: 6, to: 24 },
    arrivalTimeWindow: { from: 6, to: 24 },
    cabinClass,
    stopsFilter: "any",
    preferDirectBookingOnly: false,
    airlines: [],
    passengers: {
      adults: 1,
      children: 0,
      infantsInSeat: 0,
      infantsOnLap: 0
    },
    maxResults: 8
  };
}

describe("adjacent cabin helpers", () => {
  it("maps each cabin to the next available cabin", () => {
    expect(getNextCabinClass("economy")).toBe("premium_economy");
    expect(getNextCabinClass("premium_economy")).toBe("business");
    expect(getNextCabinClass("business")).toBe("first");
    expect(getNextCabinClass("first")).toBeNull();
  });

  it("lists every higher cabin in order", () => {
    expect(getHigherCabinClasses("economy")).toEqual([
      "premium_economy",
      "business",
      "first"
    ]);
    expect(getHigherCabinClasses("premium_economy")).toEqual([
      "business",
      "first"
    ]);
    expect(getHigherCabinClasses("first")).toEqual([]);
  });

  it("builds a search request for every higher cabin without changing filters", () => {
    expect(
      buildHigherCabinSearchRequests(buildRequest("economy")).map(
        ({ cabinClass, maxResults }) => ({ cabinClass, maxResults })
      )
    ).toEqual([
      { cabinClass: "premium_economy", maxResults: 3 },
      { cabinClass: "business", maxResults: 3 },
      { cabinClass: "first", maxResults: 3 }
    ]);
    expect(buildHigherCabinSearchRequests(buildRequest("first"))).toEqual([]);
  });

  it("builds a user-facing box title for higher-cabin pricing", () => {
    expect(buildHigherCabinBoxTitle("economy")).toBe(
      "Overall Cheapest Premium Economy or Higher"
    );
    expect(buildHigherCabinBoxTitle("business")).toBe("Overall Cheapest First");
    expect(buildHigherCabinBoxTitle("first")).toBe("Overall Cheapest First");
    expect(getCabinLabel("premium_economy")).toBe("Premium Economy");
  });

  it("keeps the cheaper fare when a higher cabin beats the earlier cabin", () => {
    const option = (totalPrice: number) =>
      ({
        source: "google_round_trip",
        totalPrice,
        currency: "USD",
        slices: [],
        bookingSource: {
          type: "unknown",
          label: "Unknown",
          detected: false
        }
      }) as FlightOption;

    const premiumEconomy = option(500);
    const first = option(450);

    expect(pickCheaperFlightOption(premiumEconomy, first)).toBe(first);
    expect(pickCheaperFlightOption(first, premiumEconomy)).toBe(first);
  });
});
