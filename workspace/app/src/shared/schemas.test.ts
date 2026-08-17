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
    expect(request.prioritizeMileFlights).toBe(false);
    expect(request.requireFreeCarryOnBag).toBe(true);
  });

  it("accepts the free carry-on requirement filter", () => {
    const request = searchRequestSchema.parse({
      tripType: "one_way",
      useExactDates: false,
      origin: "sea",
      destination: "las",
      departureDateFrom: "2026-04-15",
      departureDateTo: "2026-04-18",
      cabinClass: "economy",
      stopsFilter: "any",
      prioritizeMileFlights: true,
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

    expect(request.prioritizeMileFlights).toBe(true);
    expect(request.requireFreeCarryOnBag).toBe(true);
  });

  it("accepts an exact-date round-trip request with matched window spans", () => {
    const request = searchRequestSchema.parse({
      tripType: "round_trip",
      useExactDates: true,
      origin: "SEA",
      destination: "PIT",
      departureDateFrom: "2026-04-15",
      departureDateTo: "2026-04-18",
      returnDateFrom: "2026-04-22",
      returnDateTo: "2026-04-25",
      minimumTripDays: 14,
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
    });

    expect(request.useExactDates).toBe(true);
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

  it("rejects impossible calendar dates instead of rolling them into a different month", () => {
    expect(() =>
      searchRequestSchema.parse({
        tripType: "one_way",
        origin: "SEA",
        destination: "JFK",
        departureDateFrom: "2026-02-31",
        departureDateTo: "2026-02-31",
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
    ).toThrow(/real calendar date/i);
  });

  it("rejects more lap infants than adults", () => {
    expect(() =>
      searchRequestSchema.parse({
        tripType: "one_way",
        origin: "SEA",
        destination: "JFK",
        departureDateFrom: "2026-04-15",
        departureDateTo: "2026-04-15",
        cabinClass: "economy",
        stopsFilter: "any",
        airlines: [],
        passengers: {
          adults: 1,
          children: 0,
          infantsInSeat: 0,
          infantsOnLap: 3
        },
        maxResults: 5
      })
    ).toThrow(/lap infants cannot exceed the number of adults/i);
  });

  it("rejects passenger groups above Google Flights' total party limit", () => {
    expect(() =>
      searchRequestSchema.parse({
        tripType: "one_way",
        origin: "SEA",
        destination: "JFK",
        departureDateFrom: "2026-04-15",
        departureDateTo: "2026-04-15",
        cabinClass: "economy",
        stopsFilter: "any",
        airlines: [],
        passengers: {
          adults: 4,
          children: 3,
          infantsInSeat: 2,
          infantsOnLap: 1
        },
        maxResults: 5
      })
    ).toThrow(/at most 9 total passengers/i);
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

  it("rejects exact-date round-trip requests when the two windows span different numbers of days", () => {
    expect(() =>
      searchRequestSchema.parse({
        tripType: "round_trip",
        useExactDates: true,
        origin: "SEA",
        destination: "PIT",
        departureDateFrom: "2026-04-15",
        departureDateTo: "2026-04-18",
        returnDateFrom: "2026-04-22",
        returnDateTo: "2026-04-26",
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
    ).toThrow(/span the same number of days/i);
  });
});
