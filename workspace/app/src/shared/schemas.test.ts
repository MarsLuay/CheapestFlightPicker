import { describe, expect, it } from "vitest";

import { searchRequestSchema } from "./schemas";

describe("searchRequestSchema", () => {
  it("accepts a one-way request with normalized airport codes", () => {
    const request = searchRequestSchema.parse({
      tripType: "one_way",
      origin: "lax",
      destination: "jfk",
      departureDateFrom: "2026-04-15",
      departureDateTo: "2026-04-18",
      cabinClass: "economy",
      stopsFilter: "any",
      airlines: ["dl"],
      passengers: {
        adults: 1,
        children: 0,
        infantsInSeat: 0,
        infantsOnLap: 0
      },
      maxResults: 5
    });

    expect(request.origin).toBe("LAX");
    expect(request.destination).toBe("JFK");
    expect(request.airlines).toEqual(["DL"]);
    expect(request.minimumTripDays).toBe(0);
    expect(request.maximumTripDays).toBe(14);
    expect(request.requireFreeCarryOnBag).toBe(true);
  });

  it("accepts the free carry-on requirement filter", () => {
    const request = searchRequestSchema.parse({
      tripType: "one_way",
      origin: "sea",
      destination: "las",
      departureDateFrom: "2026-04-15",
      departureDateTo: "2026-04-18",
      cabinClass: "economy",
      stopsFilter: "any",
      requireFreeCarryOnBag: true,
      airlines: [],
      passengers: {
        adults: 1,
        children: 0,
        infantsInSeat: 0,
        infantsOnLap: 0
      },
      maxResults: 5
    });

    expect(request.requireFreeCarryOnBag).toBe(true);
  });

  it("rejects a round-trip request without a return window", () => {
    expect(() =>
      searchRequestSchema.parse({
        tripType: "round_trip",
        origin: "LAX",
        destination: "JFK",
        departureDateFrom: "2026-04-15",
        departureDateTo: "2026-04-18",
        cabinClass: "economy",
        stopsFilter: "any",
        airlines: [],
        passengers: {
          adults: 1,
          children: 0,
          infantsInSeat: 0,
          infantsOnLap: 0
        },
        maxResults: 5
      })
    ).toThrow();
  });

  it("rejects round-trip windows that cannot satisfy the trip length window", () => {
    expect(() =>
      searchRequestSchema.parse({
        tripType: "round_trip",
        origin: "SEA",
        destination: "PIT",
        departureDateFrom: "2026-04-15",
        departureDateTo: "2026-04-18",
        returnDateFrom: "2026-04-16",
        returnDateTo: "2026-04-20",
        minimumTripDays: 7,
        cabinClass: "economy",
        stopsFilter: "any",
        airlines: [],
        passengers: {
          adults: 1,
          children: 0,
          infantsInSeat: 0,
          infantsOnLap: 0
        },
        maxResults: 5
      })
    ).toThrow(/trip length between/i);
  });

  it("rejects round-trip windows that cannot satisfy the maximum trip length", () => {
    expect(() =>
      searchRequestSchema.parse({
        tripType: "round_trip",
        origin: "SEA",
        destination: "PIT",
        departureDateFrom: "2026-04-15",
        departureDateTo: "2026-04-18",
        returnDateFrom: "2026-05-20",
        returnDateTo: "2026-05-25",
        minimumTripDays: 7,
        maximumTripDays: 14,
        cabinClass: "economy",
        stopsFilter: "any",
        airlines: [],
        passengers: {
          adults: 1,
          children: 0,
          infantsInSeat: 0,
          infantsOnLap: 0
        },
        maxResults: 5
      })
    ).toThrow(/trip length between/i);
  });
});
