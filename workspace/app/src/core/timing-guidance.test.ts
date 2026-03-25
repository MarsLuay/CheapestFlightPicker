import { describe, expect, it } from "vitest";

import {
  buildHackerFareInsight,
  buildPriceAlert,
  buildTimingGuidance
} from "./timing-guidance";
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
    cheapestDirectThere: null,
    cheapestDirectReturn: null,
    cheapestMultiStop: null,
    evaluatedDatePairs: [],
    inspectedOptions: 0,
    timingGuidance: null,
    priceAlert: null,
    hackerFareInsight: null
  };
}

describe("buildTimingGuidance", () => {
  it("recommends booking when the fare is rising close to departure", () => {
    const summary = buildSummary();
    const guidance = buildTimingGuidance(
      summary,
      [
        {
          observedAt: "2026-03-18T12:00:00.000Z",
          bestPrice: 280,
          currency: "USD",
          daysUntilDeparture: 33
        },
        {
          observedAt: "2026-03-20T12:00:00.000Z",
          bestPrice: 290,
          currency: "USD",
          daysUntilDeparture: 31
        },
        {
          observedAt: "2026-03-22T12:00:00.000Z",
          bestPrice: 300,
          currency: "USD",
          daysUntilDeparture: 29
        },
        {
          observedAt: "2026-03-25T12:00:00.000Z",
          bestPrice: 305,
          currency: "USD",
          daysUntilDeparture: 26
        }
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
        {
          observedAt: "2026-03-15T12:00:00.000Z",
          bestPrice: 540,
          currency: "USD",
          daysUntilDeparture: 158
        },
        {
          observedAt: "2026-03-18T12:00:00.000Z",
          bestPrice: 520,
          currency: "USD",
          daysUntilDeparture: 155
        },
        {
          observedAt: "2026-03-21T12:00:00.000Z",
          bestPrice: 490,
          currency: "USD",
          daysUntilDeparture: 152
        },
        {
          observedAt: "2026-03-25T12:00:00.000Z",
          bestPrice: 540,
          currency: "USD",
          daysUntilDeparture: 148
        }
      ],
      new Date("2026-03-25T12:00:00.000Z")
    );

    expect(guidance?.recommendation).toBe("wait");
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
      {
        observedAt: "2026-03-18T12:00:00.000Z",
        bestPrice: 320,
        currency: "USD",
        daysUntilDeparture: 33
      },
      {
        observedAt: "2026-03-20T12:00:00.000Z",
        bestPrice: 305,
        currency: "USD",
        daysUntilDeparture: 31
      },
      {
        observedAt: "2026-03-25T12:00:00.000Z",
        bestPrice: 280,
        currency: "USD",
        daysUntilDeparture: 26
      }
    ]);

    expect(alert?.kind).toBe("new_low");
    expect(alert?.summary).toContain("$25");
  });
});
