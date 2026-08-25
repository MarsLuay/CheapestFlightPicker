import { describe, expect, it } from "vitest";

import {
  parseAirlines,
  printHeader,
  printHackerFareInsight,
  printOption,
  printPriceAlert,
  printSearchResultSummary,
  printTimingGuidance
} from "./index";
import type {
  FlightOption,
  HackerFareInsight,
  PriceAlert,
  SearchRequest,
  SearchSummary,
  TimingGuidance
} from "../shared/types";

describe("CLI output formatters", () => {
  it("should parse airlines string", () => {
    expect(parseAirlines("aa, delta,  ua ")).toEqual(["AA", "DELTA", "UA"]);
    expect(parseAirlines("")).toEqual([]);
  });

  it("should print option when option is null", () => {
    const logs: string[] = [];
    printOption("Cheapest overall", null, (msg) => logs.push(msg));
    expect(logs).toEqual(["Cheapest overall: none"]);
  });

  it("should print option with details when option exists", () => {
    const logs: string[] = [];
    const option: FlightOption = {
      source: "google_round_trip",
      totalPrice: 250,
      currency: "USD",
      bookingSource: {
        type: "direct_airline",
        label: "Delta",
        detected: true
      },
      slices: [
        {
          durationMinutes: 120,
          stops: 0,
          legs: [
            {
              airlineCode: "DL",
              airlineName: "Delta Air Lines",
              flightNumber: "DL123",
              departureAirportCode: "JFK",
              departureAirportName: "New York JFK",
              departureDateTime: "2025-05-01T08:00",
              arrivalAirportCode: "LAX",
              arrivalAirportName: "Los Angeles Intl",
              arrivalDateTime: "2025-05-01T11:00",
              durationMinutes: 180
            }
          ]
        }
      ]
    };

    printOption("Cheapest overall", option, (msg) => logs.push(msg));
    expect(logs.length).toBeGreaterThan(1);
    expect(logs[0]).toBe("Cheapest overall: USD 250");
    expect(logs[1]).toBe("  Booking source: Delta");
  });

  it("should print timing guidance", () => {
    const logs: string[] = [];
    const guidance: TimingGuidance = {
      recommendation: "book_now",
      confidence: "high",
      headline: "Book now",
      summary: "Prices are expected to rise",
      reasons: ["Prices are below average"],
      currentBestPrice: 200,
      currency: "USD",
      observedLowPrice: 180,
      observedMedianPrice: 250,
      observedHighPrice: 350,
      pricePosition: "near_low",
      trend: "rising",
      historySampleSize: 10,
      daysUntilDeparture: 14
    };

    printTimingGuidance(guidance, (msg) => logs.push(msg));
    expect(logs).toContain("Timing guidance: Book now (high confidence)");
    expect(logs).toContain("  Prices are expected to rise");
    expect(logs).toContain("  - Prices are below average");
  });

  it("should print price alert", () => {
    const logs: string[] = [];
    const alert: PriceAlert = {
      kind: "new_low",
      headline: "Price dropped by $50",
      summary: "Great time to buy!",
      changeAmount: -50,
      changePercent: -10,
      previousBestPrice: 300,
      currentBestPrice: 250,
      currency: "USD"
    };

    printPriceAlert(alert, (msg) => logs.push(msg));
    expect(logs).toContain("Price alert: Price dropped by $50");
    expect(logs).toContain("  Great time to buy!");
  });

  it("should print hacker fare insight", () => {
    const logs: string[] = [];
    const insight: HackerFareInsight = {
      savingsAmount: 30,
      savingsPercent: 10,
      hackerFarePrice: 270,
      traditionalRoundTripPrice: 300,
      currency: "USD",
      headline: "Save with separate tickets",
      summary: "Book two separate one-ways to save $30"
    };

    printHackerFareInsight(insight, (msg) => logs.push(msg));
    expect(logs).toContain("Separate one-ways: Book two separate one-ways to save $30");
  });

  it("should print search header for round trip", () => {
    const logs: string[] = [];
    const request: SearchRequest = {
      tripType: "round_trip",
      origin: "JFK",
      destination: "LAX",
      departureDateFrom: "2025-05-01",
      departureDateTo: "2025-05-05",
      returnDateFrom: "2025-05-10",
      returnDateTo: "2025-05-15",
      minimumTripDays: 3,
      maximumTripDays: 7,
      cabinClass: "economy",
      stopsFilter: "any",
      preferDirectBookingOnly: false,
      airlines: [],
      passengers: { adults: 1, children: 0, infantsInSeat: 0, infantsOnLap: 0 },
      maxResults: 12
    };

    printHeader(request, (msg) => logs.push(msg));
    expect(logs).toContain("Cheapest Flight Picker");
    expect(logs).toContain("Route: JFK -> LAX");
    expect(logs).toContain("Trip type: round_trip");
    expect(logs).toContain("Trip length: 3 to 7 days");
  });

  it("should print full search result summary", () => {
    const logs: string[] = [];
    const request: SearchRequest = {
      tripType: "one_way",
      origin: "SFO",
      destination: "JFK",
      departureDateFrom: "2025-06-01",
      departureDateTo: "2025-06-02",
      cabinClass: "economy",
      stopsFilter: "any",
      preferDirectBookingOnly: false,
      airlines: [],
      passengers: { adults: 1, children: 0, infantsInSeat: 0, infantsOnLap: 0 },
      maxResults: 12
    };

    const summary: SearchSummary = {
      request,
      departureDatePrices: [],
      returnDatePrices: [],
      cheapestOverall: null,
      cheapestRoundTrip: null,
      cheapestTwoOneWays: null,
      cheapestNonstop: null,
      cheapestMultiStop: null,
      evaluatedDatePairs: [{ departureDate: "2025-06-01" }],
      inspectedOptions: 5,
      timingGuidance: null,
      priceAlert: null,
      hackerFareInsight: null
    };

    printSearchResultSummary(summary, request, (msg) => logs.push(msg));
    expect(logs).toContain("Route: SFO -> JFK");
    expect(logs).toContain("Cheapest overall: none");
    expect(logs).toContain("Evaluated date pairs: 1");
    expect(logs).toContain("Inspected options: 5");
  });
});
