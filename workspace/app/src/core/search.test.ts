import { describe, expect, it } from "vitest";

import { FlightSearchService } from "./search";
import { searchRequestSchema } from "../shared/schemas";
import type {
  FlightOption,
  SearchProgress,
  SearchRequest,
  SearchResumeCheckpoint
} from "../shared/types";

function buildOption(
  totalPrice: number,
  source: FlightOption["source"],
  sliceCount = 1,
  firstSliceStops = 0,
  dates?: {
    outboundDate?: string;
    returnDate?: string;
  }
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
    totalPrice,
    outboundDate: dates?.outboundDate,
    returnDate: dates?.returnDate
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

function buildTimedOneWayOption({
  totalPrice,
  outboundDate,
  departureDateTime,
  arrivalDateTime,
  origin = "SEA",
  destination = "PIT"
}: {
  totalPrice: number;
  outboundDate: string;
  departureDateTime: string;
  arrivalDateTime: string;
  origin?: string;
  destination?: string;
}): FlightOption {
  return {
    currency: "USD",
    slices: [
      {
        durationMinutes: 120,
        legs: [
          {
            airlineCode: "TA",
            airlineName: "Test Air",
            flightNumber: "123",
            departureAirportCode: origin,
            departureAirportName: origin,
            departureDateTime,
            arrivalAirportCode: destination,
            arrivalAirportName: destination,
            arrivalDateTime,
            durationMinutes: 120
          }
        ],
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

function buildTimedRoundTripOption({
  totalPrice,
  outboundDate,
  returnDate,
  outboundDepartureDateTime,
  outboundArrivalDateTime,
  returnDepartureDateTime,
  returnArrivalDateTime
}: {
  totalPrice: number;
  outboundDate: string;
  returnDate: string;
  outboundDepartureDateTime: string;
  outboundArrivalDateTime: string;
  returnDepartureDateTime: string;
  returnArrivalDateTime: string;
}): FlightOption {
  return {
    currency: "USD",
    slices: [
      buildTimedOneWayOption({
        totalPrice,
        outboundDate,
        departureDateTime: outboundDepartureDateTime,
        arrivalDateTime: outboundArrivalDateTime
      }).slices[0],
      buildTimedOneWayOption({
        totalPrice,
        outboundDate: returnDate,
        departureDateTime: returnDepartureDateTime,
        arrivalDateTime: returnArrivalDateTime,
        origin: "PIT",
        destination: "SEA"
      }).slices[0]
    ],
    bookingSource: {
      type: "direct_airline",
      label: "Direct with Test Air",
      sellerName: "Test Air",
      detected: true
    },
    source: "google_round_trip",
    totalPrice,
    outboundDate,
    returnDate
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
        request: SearchRequest,
        departureDatePrices: Array<{ date: string; price: number }>,
        returnDatePrices: Array<{ date: string; price: number }>,
        maxResults: number,
        minimumTripDays: number,
        maximumTripDays: number
      ) => Array<{ departureDate: string; returnDate?: string }>;
    };

    const pairs = service.buildCandidatePairs(
      {
        tripType: "round_trip",
        useExactDates: false,
        origin: "SEA",
        destination: "PIT",
        departureDateFrom: "2026-05-01",
        departureDateTo: "2026-05-03",
        returnDateFrom: "2026-05-05",
        returnDateTo: "2026-05-10",
        minimumTripDays: 7,
        maximumTripDays: 9,
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
        maxResults: 5
      },
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
        request: SearchRequest,
        departureDatePrices: Array<{ date: string; price: number }>,
        returnDatePrices: Array<{ date: string; price: number }>,
        maxResults: number,
        minimumTripDays: number,
        maximumTripDays: number
      ) => Array<{ departureDate: string; returnDate?: string }>;
    };

    const pairs = service.buildCandidatePairs(
      {
        tripType: "round_trip",
        useExactDates: false,
        origin: "SEA",
        destination: "PIT",
        departureDateFrom: "2026-05-01",
        departureDateTo: "2026-05-03",
        returnDateFrom: "2026-05-04",
        returnDateTo: "2026-05-07",
        minimumTripDays: 0,
        maximumTripDays: 30,
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
      },
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

  it("only pairs matched departure and return offsets when exact dates are enabled", () => {
    const service = new FlightSearchService() as unknown as {
      buildCandidatePairs: (
        request: SearchRequest,
        departureDatePrices: Array<{ date: string; price: number }>,
        returnDatePrices: Array<{ date: string; price: number }>,
        maxResults: number,
        minimumTripDays: number,
        maximumTripDays: number
      ) => Array<{ departureDate: string; returnDate?: string }>;
    };

    const pairs = service.buildCandidatePairs(
      {
        tripType: "round_trip",
        useExactDates: true,
        origin: "SEA",
        destination: "PIT",
        departureDateFrom: "2026-05-01",
        departureDateTo: "2026-05-03",
        returnDateFrom: "2026-05-08",
        returnDateTo: "2026-05-10",
        minimumTripDays: 14,
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
        maxResults: 2
      },
      [
        { date: "2026-05-01", price: 100 },
        { date: "2026-05-02", price: 90 },
        { date: "2026-05-03", price: 80 }
      ],
      [
        { date: "2026-05-08", price: 120 },
        { date: "2026-05-09", price: 110 },
        { date: "2026-05-10", price: 200 }
      ],
      2,
      14,
      14
    );

    expect(pairs).toEqual([
      {
        departureDate: "2026-05-02",
        returnDate: "2026-05-09"
      },
      {
        departureDate: "2026-05-01",
        returnDate: "2026-05-08"
      },
      {
        departureDate: "2026-05-03",
        returnDate: "2026-05-10"
      }
    ]);
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
            buildOption(140, "google_one_way", 1, 0, {
              outboundDate: input.departureDate
            }),
            buildOption(160, "google_one_way", 1, 1, {
              outboundDate: input.departureDate
            })
          ];
        }

        return [
          buildOption(150, "google_one_way", 1, 0, {
            outboundDate: input.departureDate
          }),
          buildOption(170, "google_one_way", 1, 1, {
            outboundDate: input.departureDate
          })
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

  it("resumes a one-way search without rechecking completed dates", async () => {
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

    const request = searchRequestSchema.parse({
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
    });
    const normalExactDates: string[] = [];

    serviceWithMocks.provider = {
      async searchOneWayWithinWindow() {
        throw new Error("resume should reuse saved calendar prices");
      },
      async searchExactFlights(input, runtimeOptions) {
        if (!runtimeOptions?.bypassCache) {
          normalExactDates.push(input.departureDate);
        }

        return [
          buildOption(
            input.departureDate === "2026-05-09" ? 140 : 150,
            "google_one_way",
            1,
            0,
            {
              outboundDate: input.departureDate
            }
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

    const checkpoint: SearchResumeCheckpoint = {
      version: 1,
      request,
      departureDatePrices: [
        { date: "2026-05-08", price: 120 },
        { date: "2026-05-09", price: 130 }
      ],
      returnDatePrices: [],
      oneWayResults: [
        {
          departureDate: "2026-05-08",
          options: [
            buildOption(150, "google_one_way", 1, 0, {
              outboundDate: "2026-05-08"
            })
          ]
        }
      ]
    };
    const progressUpdates: SearchProgress[] = [];

    const summary = await service.search(
      request,
      (progress) => {
        progressUpdates.push(progress);
      },
      {
        resumeCheckpoint: checkpoint
      }
    );

    expect(normalExactDates).toEqual(["2026-05-09"]);
    expect(progressUpdates[0]?.stage).toBe("Resuming search");
    expect(progressUpdates[0]?.completedSteps).toBeGreaterThan(0);
    expect(summary.evaluatedDatePairs).toEqual([
      { departureDate: "2026-05-08" },
      { departureDate: "2026-05-09" }
    ]);
    expect(summary.cheapestOverall?.outboundDate).toBe("2026-05-09");
  });

  it("prioritizes the cheapest one-way calendar dates even when they appear later in the raw window", async () => {
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

    const searchedDates: string[] = [];
    serviceWithMocks.provider = {
      async searchOneWayWithinWindow() {
        return [
          { date: "2026-05-08", price: 250 },
          { date: "2026-05-09", price: 240 },
          { date: "2026-05-10", price: 230 },
          { date: "2026-05-11", price: 220 },
          { date: "2026-05-12", price: 210 },
          { date: "2026-05-13", price: 80 }
        ];
      },
      async searchExactFlights(input) {
        searchedDates.push(input.departureDate);
        return [
          buildDatedOneWayOption(
            input.departureDate === "2026-05-13" ? 95 : 300,
            input.departureDate
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

    const summary = await service.search({
      tripType: "one_way",
      origin: "SEA",
      destination: "PIT",
      departureDateFrom: "2026-05-08",
      departureDateTo: "2026-05-13",
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

    expect(summary.departureDatePrices.slice(0, 3)).toEqual([
      { date: "2026-05-13", price: 80 },
      { date: "2026-05-12", price: 210 },
      { date: "2026-05-11", price: 220 }
    ]);
    expect(searchedDates).toContain("2026-05-13");
    expect(summary.cheapestOverall?.outboundDate).toBe("2026-05-13");
    expect(summary.cheapestOverall?.totalPrice).toBe(95);
  });

  it("adds exact departure and arrival times to ranked one-way dates", async () => {
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
      async searchExactFlights(input) {
        return [
          buildTimedOneWayOption({
            totalPrice: 150,
            outboundDate: input.departureDate,
            departureDateTime: `${input.departureDate}T07:35:00`,
            arrivalDateTime: `${input.departureDate}T13:10:00`
          })
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

    expect(summary.departureDatePrices[0]).toMatchObject({
      date: "2026-05-08",
      price: 120,
      departureDateTime: "2026-05-08T07:35:00",
      arrivalDateTime: "2026-05-08T13:10:00"
    });
  });

  it("keeps the cheapest one-way exact fare even when earlier dates return more options", async () => {
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
        return [
          { date: "2026-05-08", price: 80 },
          { date: "2026-05-09", price: 90 }
        ];
      },
      async searchExactFlights(input, runtimeOptions) {
        if (input.tripType !== "one_way") {
          return [];
        }

        if (input.departureDate === "2026-05-08") {
          return runtimeOptions?.bypassCache
            ? [buildDatedOneWayOption(500, "2026-05-08")]
            : [
                buildDatedOneWayOption(500, "2026-05-08"),
                buildDatedOneWayOption(510, "2026-05-08"),
                buildDatedOneWayOption(520, "2026-05-08"),
                buildDatedOneWayOption(530, "2026-05-08")
              ];
        }

        return runtimeOptions?.bypassCache
          ? [buildDatedOneWayOption(120, "2026-05-09")]
          : [buildDatedOneWayOption(120, "2026-05-09")];
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
      maxResults: 1
    });

    expect(summary.cheapestOverall?.outboundDate).toBe("2026-05-09");
    expect(summary.cheapestOverall?.totalPrice).toBe(120);
    expect(summary.inspectedOptions).toBe(5);
    expect(summary.timingGuidance?.currentBestPrice).toBe(120);
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
              2,
              0,
              {
                outboundDate: input.departureDate,
                returnDate: input.returnDate
              }
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
    expect(liveUpdate?.previewSummary?.inspectedOptions).toBe(3);
    expect(summary.inspectedOptions).toBe(6);
    expect(summary.cheapestOverall?.totalPrice).toBe(210);
  });

  it("adds outbound and inbound times to ranked round-trip dates", async () => {
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
            origin: string;
            departureDate: string;
            returnDate?: string;
          },
          runtimeOptions?: { bypassCache?: boolean }
        ) => Promise<FlightOption[]>;
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
          : [{ date: "2026-05-15", price: 100 }];
      },
      async searchExactFlights(input) {
        if (input.tripType === "round_trip") {
          return [
            buildTimedRoundTripOption({
              totalPrice: 260,
              outboundDate: input.departureDate,
              returnDate: input.returnDate ?? "2026-05-15",
              outboundDepartureDateTime: "2026-05-08T08:20:00",
              outboundArrivalDateTime: "2026-05-08T14:05:00",
              returnDepartureDateTime: "2026-05-15T17:40:00",
              returnArrivalDateTime: "2026-05-15T21:30:00"
            })
          ];
        }

        if (input.origin === "SEA") {
          return [
            buildTimedOneWayOption({
              totalPrice: 120,
              outboundDate: input.departureDate,
              departureDateTime: "2026-05-08T07:45:00",
              arrivalDateTime: "2026-05-08T13:20:00"
            })
          ];
        }

        return [
          buildTimedOneWayOption({
            totalPrice: 100,
            outboundDate: input.departureDate,
            departureDateTime: "2026-05-15T18:15:00",
            arrivalDateTime: "2026-05-15T22:05:00",
            origin: "PIT",
            destination: "SEA"
          })
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

    expect(summary.departureDatePrices[0]).toMatchObject({
      date: "2026-05-08",
      price: 120,
      departureDateTime: "2026-05-08T07:45:00",
      arrivalDateTime: "2026-05-08T13:20:00"
    });
    expect(summary.returnDatePrices[0]).toMatchObject({
      date: "2026-05-15",
      price: 100,
      departureDateTime: "2026-05-15T18:15:00",
      arrivalDateTime: "2026-05-15T22:05:00"
    });
  });

  it("resumes a round-trip search without rechecking completed date pairs", async () => {
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
            origin: string;
            departureDate: string;
            returnDate?: string;
          },
          runtimeOptions?: { bypassCache?: boolean }
        ) => Promise<FlightOption[]>;
        searchOneWayWithinWindow: () => Promise<Array<{ date: string; price: number }>>;
      };
    };

    const request = searchRequestSchema.parse({
      tripType: "round_trip",
      useExactDates: true,
      origin: "SEA",
      destination: "PIT",
      departureDateFrom: "2026-05-08",
      departureDateTo: "2026-05-09",
      returnDateFrom: "2026-05-15",
      returnDateTo: "2026-05-16",
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
    const normalExactKeys: string[] = [];

    serviceWithMocks.provider = {
      async searchOneWayWithinWindow() {
        throw new Error("resume should reuse saved calendar prices");
      },
      async searchExactFlights(input, runtimeOptions) {
        if (!runtimeOptions?.bypassCache) {
          normalExactKeys.push(
            [
              input.tripType,
              input.origin,
              input.departureDate,
              input.returnDate ?? ""
            ].join(":")
          );
        }

        if (input.tripType === "round_trip") {
          return [
            buildOption(210, "google_round_trip", 2, 0, {
              outboundDate: input.departureDate,
              returnDate: input.returnDate
            })
          ];
        }

        return [
          buildOption(
            input.origin === "SEA" ? 95 : 100,
            "google_one_way",
            1,
            0,
            {
              outboundDate: input.departureDate
            }
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

    const checkpoint: SearchResumeCheckpoint = {
      version: 1,
      request,
      departureDatePrices: [
        { date: "2026-05-08", price: 120 },
        { date: "2026-05-09", price: 130 }
      ],
      returnDatePrices: [
        { date: "2026-05-15", price: 110 },
        { date: "2026-05-16", price: 115 }
      ],
      roundTripResults: [
        {
          departureDate: "2026-05-08",
          returnDate: "2026-05-15",
          cheapestRoundTrip: buildOption(230, "google_round_trip", 2, 0, {
            outboundDate: "2026-05-08",
            returnDate: "2026-05-15"
          }),
          cheapestTwoOneWays: buildOption(225, "two_one_way_combo", 2, 0, {
            outboundDate: "2026-05-08",
            returnDate: "2026-05-15"
          }),
          cheapestNonstop: buildOption(225, "two_one_way_combo", 2, 0, {
            outboundDate: "2026-05-08",
            returnDate: "2026-05-15"
          }),
          inspectedOptions: 3
        }
      ]
    };
    const progressUpdates: SearchProgress[] = [];

    const summary = await service.search(
      request,
      (progress) => {
        progressUpdates.push(progress);
      },
      {
        resumeCheckpoint: checkpoint
      }
    );

    expect(normalExactKeys).toEqual([
      "round_trip:SEA:2026-05-09:2026-05-16",
      "one_way:SEA:2026-05-09:",
      "one_way:PIT:2026-05-16:"
    ]);
    expect(progressUpdates[0]?.stage).toBe("Resuming search");
    expect(progressUpdates[0]?.completedSteps).toBeGreaterThan(0);
    expect(summary.evaluatedDatePairs).toEqual([
      {
        departureDate: "2026-05-08",
        returnDate: "2026-05-15"
      },
      {
        departureDate: "2026-05-09",
        returnDate: "2026-05-16"
      }
    ]);
    expect(summary.inspectedOptions).toBe(6);
    expect(summary.cheapestOverall?.outboundDate).toBe("2026-05-09");
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

  it("drops a vanished repriced one-way fare and falls back to the next matching itinerary", async () => {
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

        if (runtimeOptions?.bypassCache) {
          return [];
        }

        return [
          buildDatedOneWayOption(305, "2026-05-08"),
          buildDatedOneWayOption(320, "2026-05-08")
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
      maxResults: 2
    });

    expect(summary.cheapestOverall?.totalPrice).toBe(320);
    expect(summary.timingGuidance?.currentBestPrice).toBe(320);
  });
});
