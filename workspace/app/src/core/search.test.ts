import { describe, expect, it } from "vitest";

import { FlightSearchService } from "./search";
import type { FlightOption, SearchProgress, SearchRequest } from "../shared/types";

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

function buildDatedOneWayOption(totalPrice: number, outboundDate: string): FlightOption {
  return {
    currency: "USD",
    slices: [
      {
        durationMinutes: 120,
        legs: [],
        stops: 0
      }
    ],
    bookingSource: {
      type: "direct_airline",
      label: "Direct with Test Air",
      sellerName: "Test Air",
      detected: true
    },
    source: "google_one_way",
    totalPrice,
    outboundDate
  };
}

function buildUnknownAirlineOption(
  totalPrice: number,
  airlineCode: string,
  airlineName: string
): FlightOption {
  return {
    currency: "USD",
    slices: [
      {
        durationMinutes: 120,
        legs: [
          {
            airlineCode,
            airlineName,
            flightNumber: "123",
            departureAirportCode: "SEA",
            departureAirportName: "Seattle-Tacoma International Airport",
            departureDateTime: "2026-05-08T15:00:00.000Z",
            arrivalAirportCode: "JFK",
            arrivalAirportName: "John F. Kennedy International Airport",
            arrivalDateTime: "2026-05-08T21:00:00.000Z",
            durationMinutes: 120
          }
        ],
        stops: 0
      }
    ],
    bookingSource: {
      type: "unknown",
      label: "Booking source not confirmed",
      detected: false
    },
    source: "google_one_way",
    totalPrice,
    outboundDate: "2026-05-08"
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

  it("combines nonstop there-and-back results into a single cheapest nonstop bucket", async () => {
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
    expect(summary.cheapestNonstop?.totalPrice).toBe(160);
    expect(summary.cheapestNonstop?.source).toBe("two_one_way_combo");
  });

  it("streams live one-way preview summaries while exact fares are still being checked", async () => {
    const service = new FlightSearchService();
    const serviceWithMocks = service as unknown as {
      bookingSourceSupplementService: {
        supplementOptions: (
          options: FlightOption[],
          request: SearchRequest,
          maxTargets?: number
        ) => Promise<FlightOption[]>;
        supplementSummary: <T>(summary: T) => Promise<T>;
      };
      provider: {
        searchExactFlights: (input: {
          tripType: "one_way" | "round_trip";
          departureDate: string;
        }) => Promise<FlightOption[]>;
        searchOneWayWithinWindow: () => Promise<Array<{ date: string; price: number }>>;
      };
    };

    serviceWithMocks.provider = {
      async searchOneWayWithinWindow() {
        return [
          { date: "2026-05-08", price: 120 },
          { date: "2026-05-09", price: 130 }
        ];
      },
      async searchExactFlights(input) {
        if (input.departureDate === "2026-05-09") {
          await new Promise((resolve) => setTimeout(resolve, 20));
          return [
            buildOption(140, "google_one_way"),
            buildOption(160, "google_one_way", 1, 1)
          ];
        }

        return [
          buildOption(150, "google_one_way"),
          buildOption(170, "google_one_way", 1, 1)
        ];
      }
    };
    serviceWithMocks.bookingSourceSupplementService = {
      async supplementOptions(options) {
        return options;
      },
      async supplementSummary(summary) {
        return summary;
      }
    };

    const progressUpdates: SearchProgress[] = [];
    const summary = await service.search(
      {
        tripType: "one_way",
        origin: "SEA",
        destination: "PIT",
        departureDateFrom: "2026-05-08",
        departureDateTo: "2026-05-09",
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
        maxResults: 2
      },
      (progress) => {
        progressUpdates.push(progress);
      }
    );

    const liveUpdate = progressUpdates.find(
      (progress) =>
        progress.stage === "Checking exact flight options" &&
        progress.previewSummary?.evaluatedDatePairs.length === 1
    );

    expect(liveUpdate?.previewSummary?.departureDatePrices).toEqual([
      { date: "2026-05-08", price: 120 },
      { date: "2026-05-09", price: 130 }
    ]);
    expect(liveUpdate?.previewSummary?.cheapestOverall?.totalPrice).toBe(150);
    expect(liveUpdate?.previewSummary?.cheapestMultiStop?.totalPrice).toBe(170);
    expect(summary.cheapestOverall?.totalPrice).toBe(140);
  });

  it("streams live round-trip preview summaries while date pairs are still being compared", async () => {
    const service = new FlightSearchService();
    const serviceWithMocks = service as unknown as {
      bookingSourceSupplementService: {
        supplementOptions: (
          options: FlightOption[],
          request: SearchRequest,
          maxTargets?: number
        ) => Promise<FlightOption[]>;
        supplementSummary: <T>(summary: T) => Promise<T>;
      };
      provider: {
        searchExactFlights: (input: {
          tripType: "one_way" | "round_trip";
          origin: string;
          departureDate: string;
          returnDate?: string;
        }) => Promise<FlightOption[]>;
        searchOneWayWithinWindow: (
          request: unknown,
          origin: string
        ) => Promise<Array<{ date: string; price: number }>>;
      };
    };

    serviceWithMocks.provider = {
      async searchOneWayWithinWindow(_request, origin) {
        return origin === "SEA"
          ? [{ date: "2026-05-08", price: 120 }]
          : [
              { date: "2026-05-15", price: 100 },
              { date: "2026-05-16", price: 120 }
            ];
      },
      async searchExactFlights(input) {
        if (input.returnDate === "2026-05-16" || input.departureDate === "2026-05-16") {
          await new Promise((resolve) => setTimeout(resolve, 20));
        }

        if (input.tripType === "round_trip") {
          return [
            buildOption(
              input.returnDate === "2026-05-15" ? 230 : 210,
              "google_round_trip",
              2
            )
          ];
        }

        if (input.origin === "SEA") {
          return [
            buildOption(
              input.departureDate === "2026-05-08" ? 110 : 105,
              "google_one_way"
            )
          ];
        }

        return [
          buildOption(
            input.departureDate === "2026-05-15" ? 120 : 115,
            "google_one_way"
          )
        ];
      }
    };
    serviceWithMocks.bookingSourceSupplementService = {
      async supplementOptions(options) {
        return options;
      },
      async supplementSummary(summary) {
        return summary;
      }
    };

    const progressUpdates: SearchProgress[] = [];
    const summary = await service.search(
      {
        tripType: "round_trip",
        origin: "SEA",
        destination: "PIT",
        departureDateFrom: "2026-05-08",
        departureDateTo: "2026-05-08",
        returnDateFrom: "2026-05-15",
        returnDateTo: "2026-05-16",
        minimumTripDays: 7,
        maximumTripDays: 14,
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
      },
      (progress) => {
        progressUpdates.push(progress);
      }
    );

    const liveUpdate = progressUpdates.find(
      (progress) =>
        progress.previewSummary?.evaluatedDatePairs.length === 1 &&
        progress.previewSummary.cheapestRoundTrip?.totalPrice === 230
    );

    expect(liveUpdate?.previewSummary?.returnDatePrices).toEqual([
      { date: "2026-05-15", price: 100 },
      { date: "2026-05-16", price: 120 }
    ]);
    expect(liveUpdate?.previewSummary?.cheapestOverall?.totalPrice).toBe(230);
    expect(liveUpdate?.previewSummary?.cheapestTwoOneWays?.totalPrice).toBe(230);
    expect(summary.cheapestOverall?.totalPrice).toBe(210);
  });

  it("uses supplemented airline identity to make direct-booking preference stricter than unresolved unknown sellers", async () => {
    const service = new FlightSearchService();
    const serviceWithMocks = service as unknown as {
      bookingSourceSupplementService: {
        supplementOptions: (
          options: FlightOption[],
          request: SearchRequest,
          maxTargets?: number
        ) => Promise<FlightOption[]>;
        supplementSummary: <T>(summary: T) => Promise<T>;
      };
      provider: {
        searchExactFlights: () => Promise<FlightOption[]>;
        searchOneWayWithinWindow: () => Promise<Array<{ date: string; price: number }>>;
      };
    };

    const unresolvedCheaper = buildUnknownAirlineOption(
      80,
      "DL",
      "Delta Air Lines"
    );
    const supplementedDirect = buildUnknownAirlineOption(
      95,
      "AS",
      "Alaska Airlines"
    );

    serviceWithMocks.provider = {
      async searchOneWayWithinWindow() {
        return [{ date: "2026-05-08", price: 80 }];
      },
      async searchExactFlights() {
        return [unresolvedCheaper, supplementedDirect];
      }
    };

    serviceWithMocks.bookingSourceSupplementService = {
      async supplementOptions(options) {
        return options.map((option) =>
          option === supplementedDirect
            ? {
                ...option,
                bookingSource: {
                  ...option.bookingSource,
                  sellerName: "Alaska Airlines"
                }
              }
            : option
        );
      },
      async supplementSummary(summary) {
        return summary;
      }
    };

    const summary = await service.search({
      tripType: "one_way",
      origin: "SEA",
      destination: "JFK",
      departureDateFrom: "2026-05-08",
      departureDateTo: "2026-05-08",
      cabinClass: "economy",
      stopsFilter: "any",
      preferDirectBookingOnly: true,
      airlines: [],
      passengers: {
        adults: 1,
        children: 0,
        infantsInSeat: 0,
        infantsOnLap: 0
      },
      maxResults: 2
    });

    expect(summary.cheapestOverall?.totalPrice).toBe(95);
    expect(summary.cheapestOverall?.bookingSource.sellerName).toBe(
      "Alaska Airlines"
    );
  });

  it("reprices the top itinerary before timing guidance is attached", async () => {
    const service = new FlightSearchService();
    const serviceWithMocks = service as unknown as {
      bookingSourceSupplementService: {
        supplementOptions: (
          options: FlightOption[],
          request: SearchRequest,
          maxTargets?: number
        ) => Promise<FlightOption[]>;
        supplementSummary: <T>(summary: T) => Promise<T>;
      };
      provider: {
        searchExactFlights: (
          input: {
            tripType: "one_way" | "round_trip";
            departureDate: string;
          },
          runtimeOptions?: { bypassCache?: boolean }
        ) => Promise<FlightOption[]>;
        searchOneWayWithinWindow: () => Promise<Array<{ date: string; price: number }>>;
      };
    };

    serviceWithMocks.provider = {
      async searchOneWayWithinWindow() {
        return [{ date: "2026-05-08", price: 120 }];
      },
      async searchExactFlights(input, runtimeOptions) {
        if (input.tripType !== "one_way") {
          return [];
        }

        return runtimeOptions?.bypassCache
          ? [buildDatedOneWayOption(330, "2026-05-08")]
          : [buildDatedOneWayOption(305, "2026-05-08")];
      }
    };
    serviceWithMocks.bookingSourceSupplementService = {
      async supplementOptions(options) {
        return options;
      },
      async supplementSummary(summary) {
        return summary;
      }
    };

    const summary = await service.search({
      tripType: "one_way",
      origin: "SEA",
      destination: "PIT",
      departureDateFrom: "2026-05-08",
      departureDateTo: "2026-05-08",
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

    expect(summary.cheapestOverall?.totalPrice).toBe(330);
    expect(summary.timingGuidance?.currentBestPrice).toBe(330);
  });
});
