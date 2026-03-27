import { describe, expect, it } from "vitest";

import {
  buildWatchKey,
  buildHackerFareInsight,
  buildPriceAlert,
  buildTimingGuidance,
  TimingGuidanceService
} from "./timing-guidance";
import { stableSerialize } from "./cache";
import type { SearchSummary } from "../shared/types";

function buildSummary(): SearchSummary {
  return {
    request: {
      tripType: "round_trip",
      origin: "SEA",
      destination: "JFK",
      departureDateFrom: "2026-04-20",
      departureDateTo: "2026-04-24",
      returnDateFrom: "2026-04-27",
      returnDateTo: "2026-05-02",
      minimumTripDays: 4,
      maximumTripDays: 8,
      departureTimeWindow: { from: 6, to: 24 },
      arrivalTimeWindow: { from: 6, to: 24 },
      cabinClass: "economy",
      stopsFilter: "any",
      preferDirectBookingOnly: false,
      requireFreeCarryOnBag: true,
      airlines: [],
      passengers: {
        adults: 1,
        children: 0,
        infantsInSeat: 0,
        infantsOnLap: 0
      },
      maxResults: 10
    },
    departureDatePrices: [],
    returnDatePrices: [],
    cheapestOverall: {
      source: "google_round_trip",
      totalPrice: 305,
      currency: "USD",
      slices: [],
      bookingSource: {
        type: "direct_airline",
        label: "Direct with Test Air",
        detected: true
      }
    },
    cheapestRoundTrip: null,
    cheapestTwoOneWays: null,
    cheapestNonstop: null,
    cheapestMultiStop: null,
    evaluatedDatePairs: [],
    inspectedOptions: 0,
    timingGuidance: null,
    priceAlert: null,
    hackerFareInsight: null
  };
}

function buildObservation(
  bestPrice: number,
  observedAt: string,
  daysUntilDeparture: number
) {
  return {
    observedAt,
    bestPrice,
    currency: "USD",
    daysUntilDeparture,
    topFares: [],
    airlineMix: [],
    cheapestNonstopPrice: null,
    allTopFaresIncludeFreeCarryOnBag: true,
    directAirlineCount: 0,
    otaCount: 0,
    mixedOrUnknownCount: 0,
    optionCount: 0,
    volatility: null
  };
}

function createMemoryCache<T>() {
  const entries = new Map<string, T>();

  return {
    get(key: unknown) {
      return entries.get(stableSerialize(key)) ?? null;
    },
    set(key: unknown, value: T) {
      entries.set(stableSerialize(key), value);
    }
  };
}

describe("buildTimingGuidance", () => {
  it("recommends booking when the fare is rising close to departure", () => {
    const summary = buildSummary();
    const guidance = buildTimingGuidance(
      summary,
      [
        buildObservation(280, "2026-03-18T12:00:00.000Z", 33),
        buildObservation(290, "2026-03-20T12:00:00.000Z", 31),
        buildObservation(300, "2026-03-22T12:00:00.000Z", 29),
        buildObservation(305, "2026-03-25T12:00:00.000Z", 26)
      ],
      new Date("2026-03-25T12:00:00.000Z")
    );

    expect(guidance?.recommendation).toBe("book_now");
    expect(guidance?.trend).toBe("rising");
  });

  it("recommends waiting when there is still plenty of runway before departure", () => {
    const summary = buildSummary();
    summary.request.departureDateFrom = "2026-08-20";
    summary.request.departureDateTo = "2026-08-24";
    summary.request.returnDateFrom = "2026-08-27";
    summary.request.returnDateTo = "2026-09-02";
    if (summary.cheapestOverall) {
      summary.cheapestOverall.totalPrice = 540;
    }

    const guidance = buildTimingGuidance(
      summary,
      [
        buildObservation(540, "2026-03-15T12:00:00.000Z", 158),
        buildObservation(520, "2026-03-18T12:00:00.000Z", 155),
        buildObservation(490, "2026-03-21T12:00:00.000Z", 152),
        buildObservation(540, "2026-03-25T12:00:00.000Z", 148)
      ],
      new Date("2026-03-25T12:00:00.000Z")
    );

    expect(guidance?.recommendation).toBe("wait");
  });

  it("uses airline baseline pricing from similar searches as a booking signal", () => {
    const summary = buildSummary();
    summary.request.departureDateFrom = "2026-05-15";
    summary.request.departureDateTo = "2026-05-15";
    summary.request.returnDateFrom = "2026-05-22";
    summary.request.returnDateTo = "2026-05-22";
    if (summary.cheapestOverall) {
      summary.cheapestOverall.totalPrice = 260;
    }

    const currentObservation = {
      observedAt: "2026-03-25T12:00:00.000Z",
      bestPrice: 260,
      currency: "USD",
      daysUntilDeparture: 51,
      topFares: [
        {
          airlineCodes: ["AS"],
          bookingSourceType: "direct_airline" as const,
          durationMinutes: 310,
          includesFreeCarryOnBag: true,
          nonstop: true,
          price: 260,
          source: "google_round_trip" as const,
          stopsCount: 0
        }
      ],
      airlineMix: ["AS"],
      cheapestNonstopPrice: 260,
      allTopFaresIncludeFreeCarryOnBag: true,
      directAirlineCount: 1,
      otaCount: 0,
      mixedOrUnknownCount: 0,
      optionCount: 1,
      volatility: null
    };
    const marketObservations = [
      {
        ...currentObservation,
        observedAt: "2026-03-18T12:00:00.000Z",
        bestPrice: 320,
        topFares: [{ ...currentObservation.topFares[0], price: 320 }]
      },
      {
        ...currentObservation,
        observedAt: "2026-03-20T12:00:00.000Z",
        bestPrice: 315,
        topFares: [{ ...currentObservation.topFares[0], price: 315 }]
      },
      {
        ...currentObservation,
        observedAt: "2026-03-22T12:00:00.000Z",
        bestPrice: 330,
        topFares: [{ ...currentObservation.topFares[0], price: 330 }]
      },
      currentObservation
    ];

    const guidance = buildTimingGuidance(
      summary,
      [currentObservation],
      new Date("2026-03-25T12:00:00.000Z"),
      null,
      marketObservations
    );

    expect(guidance?.recommendation).toBe("book_now");
    expect(
      guidance?.reasons.some((reason) => reason.includes("below that baseline"))
    ).toBe(true);
  });
});

describe("buildHackerFareInsight", () => {
  it("surfaces a separate one-way insight when split one-ways beat a traditional round-trip", () => {
    const summary = buildSummary();
    summary.cheapestRoundTrip = {
      ...summary.cheapestOverall!,
      totalPrice: 420
    };
    summary.cheapestTwoOneWays = {
      ...summary.cheapestOverall!,
      source: "two_one_way_combo",
      totalPrice: 360
    };

    const insight = buildHackerFareInsight(summary);

    expect(insight?.savingsAmount).toBe(60);
    expect(insight?.headline).toBe("Separate one-ways");
    expect(insight?.summary).toBe(
      "For this route, booking separate one-way flights is currently coming in lower than a standard round-trip."
    );
  });
});

describe("buildPriceAlert", () => {
  it("flags a new low when the latest check beats prior history", () => {
    const alert = buildPriceAlert(280, "USD", [
      buildObservation(320, "2026-03-18T12:00:00.000Z", 33),
      buildObservation(305, "2026-03-20T12:00:00.000Z", 31),
      buildObservation(280, "2026-03-25T12:00:00.000Z", 26)
    ]);

    expect(alert?.kind).toBe("new_low");
    expect(alert?.summary).toContain("$25");
  });
});

describe("buildWatchKey", () => {
  it("keeps free-carry-on searches separate from unfiltered searches", () => {
    const summary = buildSummary();
    const withCarryOnKey = buildWatchKey(summary.request);
    const withoutCarryOnKey = buildWatchKey({
      ...summary.request,
      requireFreeCarryOnBag: false
    });

    expect(withCarryOnKey).not.toEqual(withoutCarryOnKey);
  });
});

describe("TimingGuidanceService", () => {
  it("stores richer timing observations for later guidance", async () => {
    const historyCache = createMemoryCache<unknown[]>();
    const service = new TimingGuidanceService({
      historyCache: historyCache as never,
      marketPriceCache: createMemoryCache<unknown>() as never,
      routeHistoryCache: createMemoryCache<unknown[]>() as never
    });
    const summary = buildSummary();
    summary.cheapestNonstop = {
      ...summary.cheapestOverall!,
      totalPrice: 340,
      slices: [
        {
          durationMinutes: 310,
          stops: 0,
          legs: [
            {
              airlineCode: "AS",
              airlineName: "Alaska Airlines",
              flightNumber: "1",
              departureAirportCode: "SEA",
              departureAirportName: "Seattle",
              departureDateTime: "2026-04-20T12:00:00.000Z",
              arrivalAirportCode: "JFK",
              arrivalAirportName: "New York",
              arrivalDateTime: "2026-04-20T18:00:00.000Z",
              durationMinutes: 310
            }
          ]
        }
      ]
    };

    const options = [
      {
        ...summary.cheapestOverall!,
        totalPrice: 305,
        slices: [
          {
            durationMinutes: 360,
            stops: 1,
            legs: [
              {
                airlineCode: "DL",
                airlineName: "Delta Air Lines",
                flightNumber: "100",
                departureAirportCode: "SEA",
                departureAirportName: "Seattle",
                departureDateTime: "2026-04-20T13:00:00.000Z",
                arrivalAirportCode: "JFK",
                arrivalAirportName: "New York",
                arrivalDateTime: "2026-04-20T19:00:00.000Z",
                durationMinutes: 360
              }
            ]
          }
        ],
        bookingSource: {
          type: "direct_airline" as const,
          label: "Direct with Delta",
          sellerName: "Delta",
          detected: true
        }
      },
      {
        ...summary.cheapestOverall!,
        totalPrice: 330,
        slices: [
          {
            durationMinutes: 355,
            stops: 1,
            legs: [
              {
                airlineCode: "UA",
                airlineName: "United Airlines",
                flightNumber: "200",
                departureAirportCode: "SEA",
                departureAirportName: "Seattle",
                departureDateTime: "2026-04-20T14:00:00.000Z",
                arrivalAirportCode: "JFK",
                arrivalAirportName: "New York",
                arrivalDateTime: "2026-04-20T20:00:00.000Z",
                durationMinutes: 355
              }
            ]
          }
        ],
        bookingSource: {
          type: "ota" as const,
          label: "OTA: Example",
          sellerName: "Example",
          detected: true
        }
      },
      summary.cheapestNonstop!
    ];

    await service.annotateSummary(summary, options, new Date("2026-03-25T12:00:00.000Z"));

    const history = historyCache.get(buildWatchKey(summary.request)) as Array<Record<string, unknown>>;
    const latestObservation = history[0];

    expect(history).toHaveLength(1);
    expect(latestObservation?.cheapestNonstopPrice).toBe(340);
    expect(latestObservation?.airlineMix).toEqual(["AS", "DL", "UA"]);
    expect(latestObservation?.directAirlineCount).toBe(2);
    expect(latestObservation?.otaCount).toBe(1);
    expect(latestObservation?.topFares).toHaveLength(3);
    expect(latestObservation?.volatility).toBeGreaterThan(0);
  });

  it("uses cached Amadeus price analysis once per route snapshot and falls back cleanly", async () => {
    const historyCache = createMemoryCache<unknown[]>();
    const marketPriceCache = createMemoryCache<unknown>();
    let calls = 0;
    const service = new TimingGuidanceService({
      historyCache: historyCache as never,
      marketPriceCache: marketPriceCache as never,
      routeHistoryCache: createMemoryCache<unknown[]>() as never,
      amadeusClient: {
        async getItineraryPriceMetrics() {
          calls += 1;
          return [
            {
              priceMetrics: [
                { quartileRanking: "MINIMUM", amount: "200" },
                { quartileRanking: "FIRST", amount: "240" },
                { quartileRanking: "MEDIUM", amount: "300" },
                { quartileRanking: "THIRD", amount: "360" },
                { quartileRanking: "MAXIMUM", amount: "420" }
              ]
            }
          ];
        }
      }
    });
    const summary = buildSummary();
    summary.cheapestOverall = {
      ...summary.cheapestOverall!,
      outboundDate: "2026-04-20"
    };
    const options = [summary.cheapestOverall];

    const firstResult = await service.annotateSummary(
      summary,
      options.filter(Boolean),
      new Date("2026-03-25T12:00:00.000Z")
    );
    const secondResult = await service.annotateSummary(
      summary,
      options.filter(Boolean),
      new Date("2026-03-26T12:00:00.000Z")
    );
    const cachedMarketEntry = marketPriceCache.get({
      currencyCode: "USD",
      departureDate: "2026-04-20",
      destinationIataCode: "JFK",
      oneWay: false,
      originIataCode: "SEA"
    }) as {
      metrics?: { source?: string };
      status?: string;
    } | null;

    expect(calls).toBe(1);
    expect(cachedMarketEntry?.status).toBe("hit");
    expect(cachedMarketEntry?.metrics?.source).toBe("amadeus");
    expect(firstResult.timingGuidance).not.toBeNull();
    expect(secondResult.timingGuidance).not.toBeNull();
  });
});
