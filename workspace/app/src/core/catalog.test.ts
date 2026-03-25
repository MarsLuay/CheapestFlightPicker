import { describe, expect, it } from "vitest";

import { findAirportByCode, findClosestAirport, searchAirports } from "./catalog";

describe("searchAirports", () => {
  it("prioritizes exact IATA code matches", () => {
    const matches = searchAirports("SEA", 5);

    expect(matches[0]?.iata).toBe("SEA");
  });
});

describe("findClosestAirport", () => {
  it("returns the airport nearest to the provided coordinates", () => {
    const seaAirport = findAirportByCode("SEA");

    expect(seaAirport).toBeDefined();

    const closestAirport = findClosestAirport(
      seaAirport!.latitude,
      seaAirport!.longitude
    );

    expect(closestAirport?.iata).toBe("SEA");
  });
});
