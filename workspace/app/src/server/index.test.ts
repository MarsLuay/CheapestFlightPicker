import { describe, it, expect } from "vitest";
import { searchJobRequestMatchesCheckpoint } from "./index";
import type { SearchRequest } from "../shared/types";
import { searchRequestSchema } from "../shared/schemas";

describe("searchJobRequestMatchesCheckpoint", () => {
  const validCheckpointRequest: SearchRequest = {
    tripType: "round_trip",
    origin: "SFO",
    destination: "JFK",
    departureDateFrom: "2024-01-01",
    departureDateTo: "2024-01-01",
    returnDateFrom: "2024-01-10",
    returnDateTo: "2024-01-10",
    passengers: {
      adults: 1,
      children: 0,
      infantsInSeat: 0,
      infantsOnLap: 0
    },
    cabinClass: "economy",
    stopsFilter: "any",
    useExactDates: false,
    minimumTripDays: 0,
    maximumTripDays: 14,
    preferDirectBookingOnly: false,
    prioritizeMileFlights: false,
    requireFreeCarryOnBag: true,
    airlines: [],
    maxResults: 10
  };

  it("returns true when requestInput perfectly matches checkpointRequest", () => {
    const requestInput = {
      tripType: "round_trip",
      origin: "SFO",
      destination: "JFK",
      departureDateFrom: "2024-01-01",
      departureDateTo: "2024-01-01",
      returnDateFrom: "2024-01-10",
      returnDateTo: "2024-01-10",
      passengers: {
        adults: 1,
        children: 0,
        infantsInSeat: 0,
        infantsOnLap: 0
      },
      cabinClass: "economy",
      stopsFilter: "any",
      useExactDates: false,
      minimumTripDays: 0,
      maximumTripDays: 14,
      preferDirectBookingOnly: false,
      prioritizeMileFlights: false,
      requireFreeCarryOnBag: true,
      airlines: [],
      maxResults: 10
    };

    // The checkpointRequest in production has been parsed by Zod,
    // which normalizes it. We mock this behavior here to ensure
    // we match stableSerialize perfectly.
    const normalizedCheckpoint = searchRequestSchema.parse(validCheckpointRequest);

    expect(searchJobRequestMatchesCheckpoint(requestInput, normalizedCheckpoint)).toBe(true);
  });

  it("returns false when requestInput does not match perfectly", () => {
    const requestInput = {
      tripType: "round_trip",
      origin: "SFO",
      destination: "JFK",
      departureDateFrom: "2024-01-01",
      departureDateTo: "2024-01-01",
      returnDateFrom: "2024-01-10",
      returnDateTo: "2024-01-11", // Changed this value
      passengers: {
        adults: 1,
        children: 0,
        infantsInSeat: 0,
        infantsOnLap: 0
      },
      cabinClass: "economy",
      stopsFilter: "any",
      useExactDates: false,
      minimumTripDays: 0,
      maximumTripDays: 14,
      preferDirectBookingOnly: false,
      prioritizeMileFlights: false,
      requireFreeCarryOnBag: true,
      airlines: [],
      maxResults: 10
    };

    const normalizedCheckpoint = searchRequestSchema.parse(validCheckpointRequest);

    expect(searchJobRequestMatchesCheckpoint(requestInput, normalizedCheckpoint)).toBe(false);
  });

  it("returns false when requestInput is invalid and fails schema validation", () => {
    const requestInput = {
      tripType: "invalid-type", // Invalid enum
      origin: "S", // Invalid airport code
    };

    const normalizedCheckpoint = searchRequestSchema.parse(validCheckpointRequest);

    expect(searchJobRequestMatchesCheckpoint(requestInput, normalizedCheckpoint)).toBe(false);
  });
});
