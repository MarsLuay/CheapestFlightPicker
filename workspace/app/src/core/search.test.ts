import { describe, expect, it } from "vitest";

import { FlightSearchService } from "./search";
import type { FlightOption } from "../shared/types";

function buildOption(
  totalPrice: number,
  source: FlightOption["source"],
  sliceCount = 1,
  firstSliceStops = 0
): FlightOption {
  return {
    currency: "USD",
    slices: Array.from({ length: sliceCount }, (_, index) => ({
      durationMinutes: 120,
      legs: [],
      stops: index === 0 ? firstSliceStops : 0
    })),
    bookingSource: {
      type: "direct_airline",
      label: "Direct with Test Air",
      sellerName: "Test Air",
      detected: true
    },
    source,
    totalPrice
  };
}

describe("FlightSearchService round-trip pairing", () => {
  it("filters candidate pairs by minimum trip days", () => {
    const service = new FlightSearchService() as unknown as {
      buildCandidatePairs: (
        departureDatePrices: Array<{ date: string; price: number }>,
        returnDatePrices: Array<{ date: string; price: number }>,
        maxResults: number,
        minimumTripDays: number,
        maximumTripDays: number
      ) => Array<{ departureDate: string; returnDate?: string }>;
    };

    const pairs = service.buildCandidatePairs(
      [
        { date: "2026-05-01", price: 100 },
        { date: "2026-05-03", price: 110 }
      ],
      [
        { date: "2026-05-05", price: 120 },
        { date: "2026-05-08", price: 130 },
        { date: "2026-05-10", price: 140 }
      ],
      5,
      7,
      9
    );

    expect(pairs).toEqual([
      {
        departureDate: "2026-05-01",
        returnDate: "2026-05-08"
      },
      {
        departureDate: "2026-05-01",
        returnDate: "2026-05-10"
      },
      {
        departureDate: "2026-05-03",
        returnDate: "2026-05-10"
      }
    ]);
  });

  it("prioritizes the cheapest date pairs by combined calendar price", () => {
    const service = new FlightSearchService() as unknown as {
      buildCandidatePairs: (
        departureDatePrices: Array<{ date: string; price: number }>,
        returnDatePrices: Array<{ date: string; price: number }>,
        maxResults: number,
        minimumTripDays: number,
        maximumTripDays: number
      ) => Array<{ departureDate: string; returnDate?: string }>;
    };

    const pairs = service.buildCandidatePairs(
      [
        { date: "2026-05-01", price: 400 },
        { date: "2026-05-02", price: 100 },
        { date: "2026-05-03", price: 120 }
      ],
      [
        { date: "2026-05-04", price: 250 },
        { date: "2026-05-05", price: 110 },
        { date: "2026-05-06", price: 115 },
        { date: "2026-05-07", price: 130 }
      ],
      1,
      0,
      30
    );

    expect(pairs).toHaveLength(8);
    expect(pairs[0]).toEqual({
      departureDate: "2026-05-02",
      returnDate: "2026-05-05"
    });
  });

  it("keeps cheapest direct outbound results separate from other fare buckets", async () => {
    const service = new FlightSearchService();
    const serviceWithMockProvider = service as unknown as {
      provider: {
        searchExactFlights: (input: {
          tripType: "one_way" | "round_trip";
          origin: string;
        }) => Promise<FlightOption[]>;
        searchOneWayWithinWindow: (
          request: unknown,
          origin: string
        ) => Promise<Array<{ date: string; price: number }>>;
      };
    };

    serviceWithMockProvider.provider = {
      async searchOneWayWithinWindow(_request, origin) {
        return origin === "SEA"
          ? [{ date: "2026-05-08", price: 100 }]
          : [{ date: "2026-05-15", price: 100 }];
      },
      async searchExactFlights(input: {
        tripType: "one_way" | "round_trip";
        origin: string;
      }) {
        if (input.tripType === "round_trip") {
          return [buildOption(220, "google_round_trip", 2)];
        }

        if (input.origin === "SEA") {
          return [
            buildOption(80, "google_one_way", 1, 1),
            buildOption(90, "google_one_way")
          ];
        }

        return [buildOption(70, "google_one_way")];
      }
    };

    const summary = await service.search({
      tripType: "round_trip",
      origin: "SEA",
      destination: "PIT",
      departureDateFrom: "2026-05-08",
      departureDateTo: "2026-05-08",
      returnDateFrom: "2026-05-15",
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
      maxResults: 1
    });

    expect(summary.cheapestTwoOneWays?.totalPrice).toBe(150);
    expect(summary.cheapestDirectThere?.totalPrice).toBe(90);
    expect(summary.cheapestDirectThere?.source).toBe("google_one_way");
  });
});
