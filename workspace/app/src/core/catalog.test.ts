import { describe, expect, it } from "vitest";

import { calculateFlightDistanceMiles, findAirlineByCode, findAirportByCode, findClosestAirport, searchAirports } from "./catalog";

describe("calculateFlightDistanceMiles", () => {
  it("returns 0 for an empty array of legs", () => {
    expect(calculateFlightDistanceMiles([])).toBe(0);
  });

  it("uses provided distanceMiles when available", () => {
    expect(
      calculateFlightDistanceMiles([
        { departureAirportCode: "SEA", arrivalAirportCode: "SFO", distanceMiles: 500 }
      ])
    ).toBe(500);
  });

  it("calculates distance using airport coordinates when distanceMiles is omitted", () => {
    const distance = calculateFlightDistanceMiles([
      { departureAirportCode: "SEA", arrivalAirportCode: "SFO" }
    ]);
    // The great-circle distance between SEA and SFO is roughly ~679 miles
    expect(distance).toBeGreaterThan(600);
    expect(distance).toBeLessThan(800);
  });

  it("ignores legs with unknown airports", () => {
    expect(
      calculateFlightDistanceMiles([
        { departureAirportCode: "UNKNOWN", arrivalAirportCode: "SFO" }
      ])
    ).toBe(0);
  });

  it("sums distances across multiple legs", () => {
    const total = calculateFlightDistanceMiles([
      { departureAirportCode: "SEA", arrivalAirportCode: "SFO", distanceMiles: 500 },
      { departureAirportCode: "SFO", arrivalAirportCode: "JFK", distanceMiles: 2500 }
    ]);
    expect(total).toBe(3000);
  });

  it("combines provided distanceMiles and calculated distances", () => {
    const distance = calculateFlightDistanceMiles([
      { departureAirportCode: "SEA", arrivalAirportCode: "SFO" },
      { departureAirportCode: "SFO", arrivalAirportCode: "JFK", distanceMiles: 2500 }
    ]);
    expect(distance).toBeGreaterThan(3100);
    expect(distance).toBeLessThan(3300);
  });
});

describe("findAirportByCode", () => {
  it("finds airport by IATA code case-insensitively", () => {
    const sea = findAirportByCode("sea");
    expect(sea).toBeDefined();
    expect(sea?.iata).toBe("SEA");
    expect(sea?.name).toContain("Seattle");
  });

  it("returns undefined for unknown airport code", () => {
    expect(findAirportByCode("INVALID_CODE")).toBeUndefined();
  });
});

describe("findAirlineByCode", () => {
  it("finds airline by IATA code case-insensitively", () => {
    const airline = findAirlineByCode("aa");
    expect(airline).toBeDefined();
    expect(airline?.iata).toBe("AA");
  });

  it("returns undefined for unknown airline code", () => {
    expect(findAirlineByCode("INVALID_CODE")).toBeUndefined();
  });
});

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
