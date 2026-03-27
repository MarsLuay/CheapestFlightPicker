import { describe, expect, it } from "vitest";

import {
  buildAdjacentCabinBoxTitle,
  buildAdjacentCabinSearchRequest,
  getCabinLabel,
  getNextCabinClass
} from "./cabin-upgrade";
import type { SearchRequest } from "./types";

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

  it("builds an adjacent-cabin search request without changing other filters", () => {
    expect(buildAdjacentCabinSearchRequest(buildRequest("economy"))).toEqual({
      ...buildRequest("economy"),
      cabinClass: "premium_economy"
    });
    expect(buildAdjacentCabinSearchRequest(buildRequest("first"))).toBeNull();
  });

  it("builds a user-facing box title for the adjacent or mirrored cabin", () => {
    expect(buildAdjacentCabinBoxTitle("economy")).toBe(
      "Overall Cheapest Premium Economy"
    );
    expect(buildAdjacentCabinBoxTitle("business")).toBe("Overall Cheapest First");
    expect(buildAdjacentCabinBoxTitle("first")).toBe("Overall Cheapest First");
    expect(getCabinLabel("premium_economy")).toBe("Premium Economy");
  });
});
