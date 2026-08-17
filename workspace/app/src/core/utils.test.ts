import { describe, expect, it } from "vitest";

import {
  clampTimeWindow,
  combineBookingSources,
  combineTwoOneWays,
  findCheapest,
  getFlightMiles,
  isLikelyDirectAirlineBookingOption,
  stopFilterToGoogleValue
} from "./utils";
import type { FlightOption } from "../shared/types";

function buildMileageOption(
  totalPrice: number,
  distanceMiles: number,
  flightNumber: string
): FlightOption {
  return {
    bookingSource: {
      type: "direct_airline",
      label: "Direct with Test Air",
      detected: true
    },
    currency: "USD",
    slices: [
      {
        durationMinutes: 120,
        stops: 0,
        legs: [
          {
            airlineCode: "TA",
            airlineName: "Test Air",
            flightNumber,
            departureAirportCode: "SEA",
            departureAirportName: "Seattle-Tacoma International Airport",
            departureDateTime: "2026-06-01T10:00:00",
            arrivalAirportCode: "PIT",
            arrivalAirportName: "Pittsburgh International Airport",
            arrivalDateTime: "2026-06-01T18:00:00",
            durationMinutes: 120,
            distanceMiles
          }
        ]
      }
    ],
    source: "google_one_way",
    totalPrice
  };
}

describe("core utils", () => {
  it("normalizes reversed time windows", () => {
    expect(clampTimeWindow({ from: 20, to: 6 })).toEqual({
      from: 6,
      to: 20
    });
  });

  it("treats 0 to 24 as unrestricted and maps end-of-day 24 to 23", () => {
    expect(clampTimeWindow({ from: 0, to: 24 })).toBeUndefined();
    expect(clampTimeWindow({ from: 6, to: 24 })).toEqual({
      from: 6,
      to: 23
    });
  });

  it("converts stop filters to Google values", () => {
    expect(stopFilterToGoogleValue("any")).toBe(0);
    expect(stopFilterToGoogleValue("nonstop")).toBe(1);
    expect(stopFilterToGoogleValue("max_1_stop")).toBe(2);
    expect(stopFilterToGoogleValue("max_2_stops")).toBe(3);
  });

  it("prefers more flown miles only when equal-price ranking is enabled", () => {
    const shorterFlight = buildMileageOption(200, 900, "100");
    const longerFlight = buildMileageOption(200, 1_800, "200");

    expect(findCheapest([shorterFlight, longerFlight])).toBe(shorterFlight);
    expect(findCheapest([shorterFlight, longerFlight], true)).toBe(longerFlight);
    expect(getFlightMiles(longerFlight)).toBe(1_800);
  });

  it("never lets miles outrank a lower fare", () => {
    const cheaperFlight = buildMileageOption(199, 900, "100");
    const longerFlight = buildMileageOption(200, 1_800, "200");

    expect(findCheapest([longerFlight, cheaperFlight], true)).toBe(cheaperFlight);
  });

  it("combines two one-way options into one round-trip style result", () => {
    const outbound = {
      bookingSource: {
        type: "direct_airline" as const,
        label: "Direct with Test Air",
        sellerName: "Test Air",
        detected: true
      },
      currency: "USD" as const,
      slices: [],
      source: "google_one_way" as const,
      totalPrice: 120
    };
    const inbound = {
      bookingSource: {
        type: "ota" as const,
        label: "OTA: SmartFares",
        sellerName: "SmartFares",
        detected: true
      },
      currency: "USD" as const,
      slices: [],
      source: "google_one_way" as const,
      totalPrice: 135
    };

    const combined = combineTwoOneWays(
      outbound,
      inbound,
      "2026-04-15",
      "2026-04-21"
    );

    expect(combined.totalPrice).toBe(255);
    expect(combined.source).toBe("two_one_way_combo");
    expect(combined.bookingSource.type).toBe("mixed");
  });

  it("combines direct-airline seller labels across slices", () => {
    const combined = combineBookingSources([
      {
        type: "direct_airline",
        label: "Direct with Alaska",
        sellerName: "Alaska",
        detected: true
      },
      {
        type: "direct_airline",
        label: "Direct with Alaska",
        sellerName: "Alaska",
        detected: true
      }
    ]);

    expect(combined).toEqual({
      type: "direct_airline",
      label: "Direct with Alaska",
      sellerName: "Alaska",
      detected: true
    });
  });

  it("infers a likely direct-airline booking when the supplemented seller matches the single operating airline", () => {
    expect(
      isLikelyDirectAirlineBookingOption({
        bookingSource: {
          type: "unknown",
          label: "Booking source not confirmed",
          sellerName: "Delta Air Lines",
          detected: false
        },
        currency: "USD",
        slices: [
          {
            durationMinutes: 120,
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
                durationMinutes: 120
              }
            ]
          }
        ],
        source: "google_one_way",
        totalPrice: 120
      })
    ).toBe(true);
  });

  it("does not infer direct-airline booking for unresolved or multi-airline unknown sellers", () => {
    expect(
      isLikelyDirectAirlineBookingOption({
        bookingSource: {
          type: "unknown",
          label: "Booking source not confirmed",
          detected: false
        },
        currency: "USD",
        slices: [
          {
            durationMinutes: 120,
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
                durationMinutes: 120
              }
            ]
          }
        ],
        source: "google_one_way",
        totalPrice: 120
      })
    ).toBe(false);

    expect(
      isLikelyDirectAirlineBookingOption({
        bookingSource: {
          type: "unknown",
          label: "Booking source not confirmed",
          sellerName: "Delta Air Lines",
          detected: false
        },
        currency: "USD",
        slices: [
          {
            durationMinutes: 240,
            stops: 1,
            legs: [
              {
                airlineCode: "DL",
                airlineName: "Delta Air Lines",
                flightNumber: "123",
                departureAirportCode: "SEA",
                departureAirportName: "Seattle-Tacoma International Airport",
                departureDateTime: "2026-06-01T15:00:00.000Z",
                arrivalAirportCode: "MSP",
                arrivalAirportName: "Minneapolis-Saint Paul International Airport",
                arrivalDateTime: "2026-06-01T18:00:00.000Z",
                durationMinutes: 120
              },
              {
                airlineCode: "KL",
                airlineName: "KLM",
                flightNumber: "602",
                departureAirportCode: "MSP",
                departureAirportName: "Minneapolis-Saint Paul International Airport",
                departureDateTime: "2026-06-01T19:00:00.000Z",
                arrivalAirportCode: "AMS",
                arrivalAirportName: "Amsterdam Airport Schiphol",
                arrivalDateTime: "2026-06-02T08:00:00.000Z",
                durationMinutes: 480
              }
            ]
          }
        ],
        source: "google_one_way",
        totalPrice: 120
      })
    ).toBe(false);
  });
});
