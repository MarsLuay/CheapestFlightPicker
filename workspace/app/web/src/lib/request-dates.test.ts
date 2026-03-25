import { describe, expect, it } from "vitest";

import {
  withDepartureDateFrom,
  withDepartureDateTo,
  withReturnDateFrom,
  withReturnDateTo
} from "./request-dates";
import type { SearchRequest } from "./types";

const baseRequest: SearchRequest = {
  tripType: "round_trip",
  origin: "SEA",
  destination: "PIT",
  departureDateFrom: "2026-05-01",
  departureDateTo: "2026-05-08",
  returnDateFrom: "2026-05-10",
  returnDateTo: "2026-05-15",
  minimumTripDays: 7,
  maximumTripDays: 14,
  departureTimeWindow: { from: 6, to: 24 },
  arrivalTimeWindow: { from: 6, to: 24 },
  cabinClass: "economy",
  stopsFilter: "any",
  preferDirectBookingOnly: false,
  airlines: [],
  passengers: {
    adults: 1,
    children: 0,
    infantsInSeat: 0,
    infantsOnLap: 0
  },
  maxResults: 10
};

describe("request date updates", () => {
  it("snaps the latest departure forward when the earliest departure moves past it", () => {
    const updatedRequest = withDepartureDateFrom(
      {
        ...baseRequest,
        departureDateTo: "2026-05-05"
      },
      "2026-05-09",
      false
    );

    expect(updatedRequest.departureDateFrom).toBe("2026-05-09");
    expect(updatedRequest.departureDateTo).toBe("2026-05-09");
    expect(updatedRequest.returnDateTo).toBe("2026-05-15");
  });

  it("keeps exact-date return windows aligned when departure dates snap forward", () => {
    const updatedRequest = withDepartureDateFrom(
      {
        ...baseRequest,
        departureDateTo: "2026-05-05",
        returnDateFrom: "2026-05-01",
        returnDateTo: "2026-05-05"
      },
      "2026-05-09",
      true
    );

    expect(updatedRequest.departureDateFrom).toBe("2026-05-09");
    expect(updatedRequest.departureDateTo).toBe("2026-05-09");
    expect(updatedRequest.returnDateFrom).toBe("2026-05-09");
    expect(updatedRequest.returnDateTo).toBe("2026-05-09");
  });

  it("snaps the latest departure forward when it is set earlier than the current earliest departure", () => {
    const updatedRequest = withDepartureDateTo(
      baseRequest,
      "2026-04-30",
      false
    );

    expect(updatedRequest.departureDateTo).toBe("2026-05-01");
  });

  it("snaps the latest return forward when the earliest return moves past it", () => {
    const updatedRequest = withReturnDateFrom(
      {
        ...baseRequest,
        returnDateTo: "2026-05-12"
      },
      "2026-05-14",
      false
    );

    expect(updatedRequest.returnDateFrom).toBe("2026-05-14");
    expect(updatedRequest.returnDateTo).toBe("2026-05-14");
  });

  it("keeps exact-date departure windows aligned when return dates snap forward", () => {
    const updatedRequest = withReturnDateFrom(
      {
        ...baseRequest,
        departureDateFrom: "2026-05-10",
        departureDateTo: "2026-05-12",
        returnDateTo: "2026-05-12"
      },
      "2026-05-14",
      true
    );

    expect(updatedRequest.departureDateFrom).toBe("2026-05-14");
    expect(updatedRequest.departureDateTo).toBe("2026-05-14");
    expect(updatedRequest.returnDateFrom).toBe("2026-05-14");
    expect(updatedRequest.returnDateTo).toBe("2026-05-14");
  });

  it("snaps the latest return forward when it is set earlier than the current earliest return", () => {
    const updatedRequest = withReturnDateTo(
      baseRequest,
      "2026-05-09",
      false
    );

    expect(updatedRequest.returnDateTo).toBe("2026-05-10");
  });
});
