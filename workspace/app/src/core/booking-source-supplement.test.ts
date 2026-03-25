import { describe, expect, it } from "vitest";

import {
  BookingSourceSupplementService,
  getBookingSourceSupplementReasons,
  needsBookingSourceSupplement
} from "./booking-source-supplement";
import type { FlightOption, SearchRequest, SearchSummary } from "../shared/types";

function buildOption(
  overrides: Partial<FlightOption> = {}
): FlightOption {
  return {
    source: "google_one_way",
    totalPrice: 245,
    currency: "USD",
    slices: [
      {
        durationMinutes: 180,
        stops: 0,
        legs: [
          {
            airlineCode: "DL",
            airlineName: "Delta Air Lines",
            flightNumber: "123",
            departureAirportCode: "SEA",
            departureAirportName: "Seattle-Tacoma International Airport",
            departureDateTime: "2026-06-01T15:00:00.000Z",
            arrivalAirportCode: "JFK",
            arrivalAirportName: "John F. Kennedy International Airport",
            arrivalDateTime: "2026-06-01T21:00:00.000Z",
            durationMinutes: 180
          }
        ]
      }
    ],
    bookingSource: {
      type: "unknown",
      label: "Booking source not confirmed",
      detected: false
    },
    outboundDate: "2026-06-01",
    ...overrides
  };
}

function buildRequest(
  overrides: Partial<SearchRequest> = {}
): SearchRequest {
  return {
    tripType: "one_way",
    origin: "SEA",
    destination: "JFK",
    departureDateFrom: "2026-06-01",
    departureDateTo: "2026-06-01",
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
    maxResults: 5,
    ...overrides
  };
}

function buildSummary(
  option: FlightOption,
  requestOverrides: Partial<SearchRequest> = {}
): SearchSummary {
  return {
    request: buildRequest(requestOverrides),
    departureDatePrices: [],
    returnDatePrices: [],
    cheapestOverall: option,
    cheapestRoundTrip: null,
    cheapestTwoOneWays: null,
    cheapestDirectThere: option,
    cheapestDirectReturn: null,
    cheapestMultiStop: null,
    evaluatedDatePairs: [],
    inspectedOptions: 1,
    timingGuidance: null,
    priceAlert: null,
    hackerFareInsight: null
  };
}

describe("needsBookingSourceSupplement", () => {
  it("only targets unresolved Google-backed options", () => {
    expect(needsBookingSourceSupplement(buildOption())).toBe(true);
    expect(
      needsBookingSourceSupplement(
        buildOption({
          bookingSource: {
            type: "direct_airline",
            label: "Direct with Delta Air Lines",
            sellerName: "Delta Air Lines",
            detected: true
          }
        })
      )
    ).toBe(false);
    expect(
      needsBookingSourceSupplement(
        buildOption({
          source: "two_one_way_combo"
        })
      )
    ).toBe(false);
  });
});

describe("getBookingSourceSupplementReasons", () => {
  it("targets airline-filtered searches even when Google leaves the seller unresolved", () => {
    expect(
      getBookingSourceSupplementReasons(
        buildOption(),
        buildRequest({
          airlines: ["DL"]
        })
      )
    ).toContain("airline_filter");
  });

  it("targets international routes and nonstop gaps", () => {
    const option = buildOption({
      slices: [
        {
          durationMinutes: 90,
          stops: 0,
          legs: [
            {
              airlineCode: "AC",
              airlineName: "Air Canada",
              flightNumber: "540",
              departureAirportCode: "SEA",
              departureAirportName: "Seattle-Tacoma International Airport",
              departureDateTime: "2026-06-01T15:00:00.000Z",
              arrivalAirportCode: "YVR",
              arrivalAirportName: "Vancouver International Airport",
              arrivalDateTime: "2026-06-01T16:30:00.000Z",
              durationMinutes: 90
            }
          ]
        }
      ]
    });

    expect(
      getBookingSourceSupplementReasons(
        option,
        buildRequest({
          destination: "YVR"
        })
      )
    ).toEqual(
      expect.arrayContaining([
        "international_route",
        "targeted_airline",
        "nonstop_direct_booking_gap"
      ])
    );
  });

  it("skips routine domestic connecting itineraries with no targeting signals", () => {
    const option = buildOption({
      slices: [
        {
          durationMinutes: 340,
          stops: 1,
          legs: [
            {
              airlineCode: "DL",
              airlineName: "Delta Air Lines",
              flightNumber: "150",
              departureAirportCode: "SEA",
              departureAirportName: "Seattle-Tacoma International Airport",
              departureDateTime: "2026-06-01T15:00:00.000Z",
              arrivalAirportCode: "MSP",
              arrivalAirportName: "Minneapolis-Saint Paul International Airport",
              arrivalDateTime: "2026-06-01T18:00:00.000Z",
              durationMinutes: 180
            },
            {
              airlineCode: "DL",
              airlineName: "Delta Air Lines",
              flightNumber: "200",
              departureAirportCode: "MSP",
              departureAirportName: "Minneapolis-Saint Paul International Airport",
              departureDateTime: "2026-06-01T19:00:00.000Z",
              arrivalAirportCode: "JFK",
              arrivalAirportName: "John F. Kennedy International Airport",
              arrivalDateTime: "2026-06-01T22:00:00.000Z",
              durationMinutes: 160
            }
          ]
        }
      ]
    });

    expect(getBookingSourceSupplementReasons(option, buildRequest())).toEqual([]);
  });
});

describe("BookingSourceSupplementService", () => {
  it("supplements each unresolved summary option once and reuses the replacement", async () => {
    const option = buildOption();
    const summary = buildSummary(option);
    const service = new BookingSourceSupplementService([
      {
        async supplementOption(target) {
          return {
            ...target,
            bookingSource: {
              ...target.bookingSource,
              sellerName: "Delta Air Lines"
            }
          };
        }
      }
    ]);

    const nextSummary = await service.supplementSummary(summary);

    expect(nextSummary.cheapestOverall?.bookingSource.sellerName).toBe(
      "Delta Air Lines"
    );
    expect(nextSummary.cheapestDirectThere?.bookingSource.sellerName).toBe(
      "Delta Air Lines"
    );
    expect(nextSummary.cheapestOverall).toBe(nextSummary.cheapestDirectThere);
  });

  it("skips backup-provider calls for non-targeted unresolved results", async () => {
    const option = buildOption({
      slices: [
        {
          durationMinutes: 340,
          stops: 1,
          legs: [
            {
              airlineCode: "DL",
              airlineName: "Delta Air Lines",
              flightNumber: "150",
              departureAirportCode: "SEA",
              departureAirportName: "Seattle-Tacoma International Airport",
              departureDateTime: "2026-06-01T15:00:00.000Z",
              arrivalAirportCode: "MSP",
              arrivalAirportName: "Minneapolis-Saint Paul International Airport",
              arrivalDateTime: "2026-06-01T18:00:00.000Z",
              durationMinutes: 180
            },
            {
              airlineCode: "DL",
              airlineName: "Delta Air Lines",
              flightNumber: "200",
              departureAirportCode: "MSP",
              departureAirportName: "Minneapolis-Saint Paul International Airport",
              departureDateTime: "2026-06-01T19:00:00.000Z",
              arrivalAirportCode: "JFK",
              arrivalAirportName: "John F. Kennedy International Airport",
              arrivalDateTime: "2026-06-01T22:00:00.000Z",
              durationMinutes: 160
            }
          ]
        }
      ]
    });
    const summary = buildSummary(option);
    let calls = 0;
    const service = new BookingSourceSupplementService([
      {
        async supplementOption(target) {
          calls += 1;
          return {
            ...target,
            bookingSource: {
              ...target.bookingSource,
              sellerName: "Should not be used"
            }
          };
        }
      }
    ]);

    const nextSummary = await service.supplementSummary(summary);

    expect(calls).toBe(0);
    expect(nextSummary.cheapestOverall).toBe(option);
    expect(nextSummary.cheapestOverall?.bookingSource.sellerName).toBeUndefined();
  });
});
