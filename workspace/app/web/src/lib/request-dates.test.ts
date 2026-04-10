import { describe, expect, it } from "vitest";

import {
  withDepartureDateFrom,
  withDepartureDateTo,
  withMinimumTripDays,
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
    expect(updatedRequest.returnDateFrom).toBe("2026-05-16");
    expect(updatedRequest.returnDateTo).toBe("2026-05-16");
  });

  it("keeps exact-date return windows aligned when departure dates snap forward", () => {
    const updatedRequest = withDepartureDateFrom(
      {
        ...baseRequest,
        departureDateTo: "2026-05-05",
        returnDateFrom: "2026-05-10",
        returnDateTo: "2026-05-14"
      },
      "2026-05-09",
      true
    );

    expect(updatedRequest.departureDateFrom).toBe("2026-05-09");
    expect(updatedRequest.departureDateTo).toBe("2026-05-09");
    expect(updatedRequest.returnDateFrom).toBe("2026-05-18");
    expect(updatedRequest.returnDateTo).toBe("2026-05-18");
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
      "2026-05-04",
      false
    );

    expect(updatedRequest.returnDateFrom).toBe("2026-05-08");
    expect(updatedRequest.returnDateTo).toBe("2026-05-12");
  });

  it("keeps exact-date departure windows aligned when return dates snap forward", () => {
    const updatedRequest = withReturnDateFrom(
      {
        ...baseRequest,
        departureDateFrom: "2026-05-01",
        departureDateTo: "2026-05-03",
        returnDateTo: "2026-05-12"
      },
      "2026-05-14",
      true
    );

    expect(updatedRequest.departureDateFrom).toBe("2026-05-05");
    expect(updatedRequest.departureDateTo).toBe("2026-05-05");
    expect(updatedRequest.returnDateFrom).toBe("2026-05-14");
    expect(updatedRequest.returnDateTo).toBe("2026-05-14");
  });

  it("does not apply the minimum-trip floor in exact-date mode", () => {
    const updatedRequest = withReturnDateFrom(
      {
        ...baseRequest,
        minimumTripDays: 14,
        maximumTripDays: 14,
        departureDateFrom: "2026-05-01",
        departureDateTo: "2026-05-03",
        returnDateFrom: "2026-05-10",
        returnDateTo: "2026-05-07"
      },
      "2026-05-05",
      true
    );

    expect(updatedRequest.returnDateFrom).toBe("2026-05-05");
    expect(updatedRequest.returnDateTo).toBe("2026-05-07");
    expect(updatedRequest.departureDateFrom).toBe("2026-04-26");
    expect(updatedRequest.departureDateTo).toBe("2026-05-03");
  });

  it("shifts matched return dates when the latest departure date changes in exact-date mode", () => {
    const updatedRequest = withDepartureDateTo(
      baseRequest,
      "2026-05-10",
      true
    );

    expect(updatedRequest.departureDateTo).toBe("2026-05-10");
    expect(updatedRequest.returnDateTo).toBe("2026-05-17");
    expect(updatedRequest.returnDateFrom).toBe("2026-05-10");
  });

  it("shifts the matched latest departure date when the latest return date changes in exact-date mode", () => {
    const updatedRequest = withReturnDateTo(
      baseRequest,
      "2026-05-18",
      true
    );

    expect(updatedRequest.returnDateTo).toBe("2026-05-18");
    expect(updatedRequest.departureDateTo).toBe("2026-05-11");
    expect(updatedRequest.departureDateFrom).toBe("2026-05-01");
  });

  it("snaps the latest return forward when it is set earlier than the current earliest return", () => {
    const updatedRequest = withReturnDateTo(
      baseRequest,
      "2026-05-09",
      false
    );

    expect(updatedRequest.returnDateTo).toBe("2026-05-10");
  });

  it("moves the earliest return date forward when the minimum trip length increases past it", () => {
    const updatedRequest = withMinimumTripDays(
      {
        ...baseRequest,
        minimumTripDays: 3,
        maximumTripDays: 14,
        returnDateFrom: "2026-05-03",
        returnDateTo: "2026-05-15"
      },
      7
    );

    expect(updatedRequest.minimumTripDays).toBe(7);
    expect(updatedRequest.maximumTripDays).toBe(14);
    expect(updatedRequest.returnDateFrom).toBe("2026-05-08");
    expect(updatedRequest.returnDateTo).toBe("2026-05-15");
  });

  it("sets the earliest return date to exactly the minimum-trip floor", () => {
    const updatedRequest = withMinimumTripDays(
      {
        ...baseRequest,
        minimumTripDays: 3,
        maximumTripDays: 14,
        returnDateFrom: "2026-05-12",
        returnDateTo: "2026-05-20"
      },
      7
    );

    expect(updatedRequest.minimumTripDays).toBe(7);
    expect(updatedRequest.returnDateFrom).toBe("2026-05-08");
    expect(updatedRequest.returnDateTo).toBe("2026-05-20");
  });

  it("snaps the latest return forward when the minimum trip length pushes the earliest return past it", () => {
    const updatedRequest = withMinimumTripDays(
      {
        ...baseRequest,
        minimumTripDays: 2,
        maximumTripDays: 3,
        returnDateFrom: "2026-05-02",
        returnDateTo: "2026-05-05"
      },
      7
    );

    expect(updatedRequest.minimumTripDays).toBe(7);
    expect(updatedRequest.maximumTripDays).toBe(7);
    expect(updatedRequest.returnDateFrom).toBe("2026-05-08");
    expect(updatedRequest.returnDateTo).toBe("2026-05-08");
  });
});
