import { describe, test, expect } from "vitest";
import { summarizeSearchRequest } from "./index";
import type { SearchRequest } from "../shared/types";

describe("summarizeSearchRequest", () => {
  test("handles null input", () => {
    expect(summarizeSearchRequest(null)).toEqual({
      requestType: "null",
    });
  });

  test("handles non-object input", () => {
    expect(summarizeSearchRequest("string")).toEqual({
      requestType: "string",
    });
    expect(summarizeSearchRequest(123)).toEqual({
      requestType: "number",
    });
    expect(summarizeSearchRequest(undefined)).toEqual({
      requestType: "undefined",
    });
  });

  test("handles empty object input", () => {
    expect(summarizeSearchRequest({})).toEqual({
      tripType: "unknown",
      route: "unknown",
      useExactDates: false,
      departureDateFrom: null,
      departureDateTo: null,
      returnDateFrom: null,
      returnDateTo: null,
      minimumTripDays: 0,
      maximumTripDays: 14,
      departureTimeWindow: null,
      arrivalTimeWindow: null,
      effectiveDepartureTimeWindow: null,
      effectiveArrivalTimeWindow: null,
      cabinClass: null,
      stopsFilter: null,
      preferDirectBookingOnly: false,
      prioritizeMileFlights: false,
      requireFreeCarryOnBag: true,
      airlines: [],
      passengers: null,
      maxResults: null,
    });
  });

  test("handles partial object input", () => {
    expect(
      summarizeSearchRequest({
        tripType: "round_trip",
        origin: "NYC",
        useExactDates: true,
      })
    ).toEqual({
      tripType: "round_trip",
      route: "unknown",
      useExactDates: true,
      departureDateFrom: null,
      departureDateTo: null,
      returnDateFrom: null,
      returnDateTo: null,
      minimumTripDays: 0,
      maximumTripDays: 14,
      departureTimeWindow: null,
      arrivalTimeWindow: null,
      effectiveDepartureTimeWindow: null,
      effectiveArrivalTimeWindow: null,
      cabinClass: null,
      stopsFilter: null,
      preferDirectBookingOnly: false,
      prioritizeMileFlights: false,
      requireFreeCarryOnBag: true,
      airlines: [],
      passengers: null,
      maxResults: null,
    });
  });

  test("handles full object input", () => {
    const fullRequest: SearchRequest = {
      tripType: "round_trip",
      origin: "JFK",
      destination: "LHR",
      departureDateFrom: "2024-01-01",
      departureDateTo: "2024-01-31",
      returnDateFrom: "2024-02-01",
      returnDateTo: "2024-02-28",
      minimumTripDays: 5,
      maximumTripDays: 10,
      departureTimeWindow: {
        from: 8,
        to: 12,
      },
      arrivalTimeWindow: null,
      cabinClass: "economy",
      stopsFilter: "max_1_stop",
      preferDirectBookingOnly: true,
      prioritizeMileFlights: false,
      requireFreeCarryOnBag: false,
      airlines: ["BA", "VS"],
      passengers: {
        adults: 2,
        children: 1,
        infantsOnLap: 0,
        infantsInSeat: 0,
      },
      maxResults: 50,
    };

    expect(summarizeSearchRequest(fullRequest)).toEqual({
      tripType: "round_trip",
      route: "JFK -> LHR",
      useExactDates: false,
      departureDateFrom: "2024-01-01",
      departureDateTo: "2024-01-31",
      returnDateFrom: "2024-02-01",
      returnDateTo: "2024-02-28",
      minimumTripDays: 5,
      maximumTripDays: 10,
      departureTimeWindow: {
        from: 8,
        to: 12,
      },
      arrivalTimeWindow: null,
      effectiveDepartureTimeWindow: {
        from: 8,
        to: 12,
      },
      effectiveArrivalTimeWindow: null,
      cabinClass: "economy",
      stopsFilter: "max_1_stop",
      preferDirectBookingOnly: true,
      prioritizeMileFlights: false,
      requireFreeCarryOnBag: false,
      airlines: ["BA", "VS"],
      passengers: {
        adults: 2,
        children: 1,
        infantsOnLap: 0,
        infantsInSeat: 0,
      },
      maxResults: 50,
    });
  });
});
