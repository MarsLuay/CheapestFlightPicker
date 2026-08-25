import { describe, expect, it } from "vitest";
import {
  getOptionAirlineCodes,
  isNonstopOption,
  optionAppearsToIncludeFreeCarryOnBag
} from "./fare-characteristics";
import type { FlightOption } from "../shared/types";

function buildOption(overrides: Partial<FlightOption> = {}): FlightOption {
  return {
    source: "google_one_way",
    totalPrice: 200,
    currency: "USD",
    slices: [
      {
        durationMinutes: 120,
        stops: 0,
        legs: [
          {
            airlineCode: "DL",
            airlineName: "Delta Air Lines",
            flightNumber: "100",
            departureAirportCode: "SEA",
            departureAirportName: "Seattle",
            departureDateTime: "2026-06-01T08:00:00.000Z",
            arrivalAirportCode: "SFO",
            arrivalAirportName: "San Francisco",
            arrivalDateTime: "2026-06-01T10:00:00.000Z",
            durationMinutes: 120
          }
        ]
      }
    ],
    bookingSource: {
      type: "unknown",
      label: "Unknown",
      detected: false
    },
    outboundDate: "2026-06-01",
    ...overrides
  };
}

describe("fare-characteristics", () => {
  describe("getOptionAirlineCodes", () => {
    it("returns sorted unique airline codes across all slices and legs", () => {
      const option = buildOption({
        slices: [
          {
            durationMinutes: 300,
            stops: 1,
            legs: [
              {
                airlineCode: "UA",
                airlineName: "United",
                flightNumber: "1",
                departureAirportCode: "SEA",
                departureAirportName: "Seattle",
                departureDateTime: "2026-06-01T08:00:00.000Z",
                arrivalAirportCode: "DEN",
                arrivalAirportName: "Denver",
                arrivalDateTime: "2026-06-01T11:00:00.000Z",
                durationMinutes: 180
              },
              {
                airlineCode: "AA",
                airlineName: "American",
                flightNumber: "2",
                departureAirportCode: "DEN",
                departureAirportName: "Denver",
                arrivalAirportCode: "JFK",
                arrivalAirportName: "New York",
                departureDateTime: "2026-06-01T12:00:00.000Z",
                arrivalDateTime: "2026-06-01T15:00:00.000Z",
                durationMinutes: 120
              }
            ]
          },
          {
            durationMinutes: 300,
            stops: 0,
            legs: [
              {
                airlineCode: "UA", // duplicate airline code
                airlineName: "United",
                flightNumber: "3",
                departureAirportCode: "JFK",
                departureAirportName: "New York",
                arrivalAirportCode: "SEA",
                arrivalAirportName: "Seattle",
                departureDateTime: "2026-06-10T08:00:00.000Z",
                arrivalDateTime: "2026-06-10T14:00:00.000Z",
                durationMinutes: 300
              },
              {
                airlineCode: "DL",
                airlineName: "Delta",
                flightNumber: "4",
                departureAirportCode: "SEA",
                departureAirportName: "Seattle",
                arrivalAirportCode: "PDX",
                arrivalAirportName: "Portland",
                departureDateTime: "2026-06-10T15:00:00.000Z",
                arrivalDateTime: "2026-06-10T16:00:00.000Z",
                durationMinutes: 60
              }
            ]
          }
        ]
      });

      expect(getOptionAirlineCodes(option)).toEqual(["AA", "DL", "UA"]);
    });

    it("ignores empty or missing airline codes", () => {
      const option = buildOption({
        slices: [
          {
            durationMinutes: 120,
            stops: 0,
            legs: [
              {
                airlineCode: "",
                airlineName: "Unknown Airline",
                flightNumber: "100",
                departureAirportCode: "SEA",
                departureAirportName: "Seattle",
                departureDateTime: "2026-06-01T08:00:00.000Z",
                arrivalAirportCode: "SFO",
                arrivalAirportName: "San Francisco",
                arrivalDateTime: "2026-06-01T10:00:00.000Z",
                durationMinutes: 120
              },
              {
                airlineCode: "AS",
                airlineName: "Alaska Airlines",
                flightNumber: "200",
                departureAirportCode: "SFO",
                departureAirportName: "San Francisco",
                departureDateTime: "2026-06-01T11:00:00.000Z",
                arrivalAirportCode: "LAX",
                arrivalAirportName: "Los Angeles",
                arrivalDateTime: "2026-06-01T12:30:00.000Z",
                durationMinutes: 90
              }
            ]
          }
        ]
      });

      expect(getOptionAirlineCodes(option)).toEqual(["AS"]);
    });

    it("returns an empty array when option has no slices or legs", () => {
      const optionNoSlices = buildOption({ slices: [] });
      expect(getOptionAirlineCodes(optionNoSlices)).toEqual([]);

      const optionEmptyLegs = buildOption({
        slices: [{ durationMinutes: 0, stops: 0, legs: [] }]
      });
      expect(getOptionAirlineCodes(optionEmptyLegs)).toEqual([]);
    });
  });

  describe("isNonstopOption", () => {
    it("returns true for flight option where all slices have 0 stops", () => {
      const singleNonstopSlice = buildOption({
        slices: [{ durationMinutes: 120, stops: 0, legs: [] }]
      });
      expect(isNonstopOption(singleNonstopSlice)).toBe(true);

      const roundTripNonstopSlices = buildOption({
        slices: [
          { durationMinutes: 120, stops: 0, legs: [] },
          { durationMinutes: 130, stops: 0, legs: [] }
        ]
      });
      expect(isNonstopOption(roundTripNonstopSlices)).toBe(true);
    });

    it("returns false if any slice has 1 or more stops", () => {
      const optionWithStops = buildOption({
        slices: [
          { durationMinutes: 120, stops: 0, legs: [] },
          { durationMinutes: 300, stops: 1, legs: [] }
        ]
      });
      expect(isNonstopOption(optionWithStops)).toBe(false);
    });

    it("returns false if option has no slices", () => {
      const optionNoSlices = buildOption({ slices: [] });
      expect(isNonstopOption(optionNoSlices)).toBe(false);
    });
  });

  describe("optionAppearsToIncludeFreeCarryOnBag", () => {
    it("returns true for non-economy cabin classes regardless of airline", () => {
      const optionWithRestrictedAirline = buildOption({
        slices: [
          {
            durationMinutes: 120,
            stops: 0,
            legs: [
              {
                airlineCode: "NK", // Spirit Airlines (restricted for economy)
                airlineName: "Spirit Airlines",
                flightNumber: "100",
                departureAirportCode: "SEA",
                departureAirportName: "Seattle",
                departureDateTime: "2026-06-01T08:00:00.000Z",
                arrivalAirportCode: "LAS",
                arrivalAirportName: "Las Vegas",
                arrivalDateTime: "2026-06-01T10:00:00.000Z",
                durationMinutes: 120
              }
            ]
          }
        ]
      });

      expect(optionAppearsToIncludeFreeCarryOnBag(optionWithRestrictedAirline, "business")).toBe(true);
      expect(optionAppearsToIncludeFreeCarryOnBag(optionWithRestrictedAirline, "first")).toBe(true);
      expect(optionAppearsToIncludeFreeCarryOnBag(optionWithRestrictedAirline, "premium_economy")).toBe(true);
    });

    it("returns true when option has no airline codes", () => {
      const optionNoAirline = buildOption({ slices: [] });
      expect(optionAppearsToIncludeFreeCarryOnBag(optionNoAirline, "economy")).toBe(true);
    });

    it("returns true for economy class with non-restricted airlines", () => {
      const option = buildOption({
        slices: [
          {
            durationMinutes: 120,
            stops: 0,
            legs: [
              {
                airlineCode: "DL",
                airlineName: "Delta Air Lines",
                flightNumber: "100",
                departureAirportCode: "SEA",
                departureAirportName: "Seattle",
                departureDateTime: "2026-06-01T08:00:00.000Z",
                arrivalAirportCode: "SFO",
                arrivalAirportName: "San Francisco",
                arrivalDateTime: "2026-06-01T10:00:00.000Z",
                durationMinutes: 120
              }
            ]
          }
        ]
      });

      expect(optionAppearsToIncludeFreeCarryOnBag(option, "economy")).toBe(true);
    });

    it("returns false for economy class with any carry-on restricted airlines (F9, G4, NK, SY, XP)", () => {
      const restrictedCodes = ["F9", "G4", "NK", "SY", "XP"];

      for (const code of restrictedCodes) {
        const option = buildOption({
          slices: [
            {
              durationMinutes: 120,
              stops: 0,
              legs: [
                {
                  airlineCode: code,
                  airlineName: "Restricted Airline",
                  flightNumber: "100",
                  departureAirportCode: "SEA",
                  departureAirportName: "Seattle",
                  departureDateTime: "2026-06-01T08:00:00.000Z",
                  arrivalAirportCode: "LAS",
                  arrivalAirportName: "Las Vegas",
                  arrivalDateTime: "2026-06-01T10:00:00.000Z",
                  durationMinutes: 120
                }
              ]
            }
          ]
        });

        expect(optionAppearsToIncludeFreeCarryOnBag(option, "economy")).toBe(false);
      }
    });

    it("returns false when economy option has a mix of standard and restricted airlines", () => {
      const option = buildOption({
        slices: [
          {
            durationMinutes: 300,
            stops: 1,
            legs: [
              {
                airlineCode: "DL",
                airlineName: "Delta Air Lines",
                flightNumber: "100",
                departureAirportCode: "SEA",
                departureAirportName: "Seattle",
                departureDateTime: "2026-06-01T08:00:00.000Z",
                arrivalAirportCode: "MSP",
                arrivalAirportName: "Minneapolis",
                arrivalDateTime: "2026-06-01T11:00:00.000Z",
                durationMinutes: 180
              },
              {
                airlineCode: "F9", // Frontier Airlines
                airlineName: "Frontier Airlines",
                flightNumber: "200",
                departureAirportCode: "MSP",
                departureAirportName: "Minneapolis",
                departureDateTime: "2026-06-01T12:00:00.000Z",
                arrivalAirportCode: "DEN",
                arrivalAirportName: "Denver",
                arrivalDateTime: "2026-06-01T14:00:00.000Z",
                durationMinutes: 120
              }
            ]
          }
        ]
      });

      expect(optionAppearsToIncludeFreeCarryOnBag(option, "economy")).toBe(false);
    });
  });
});
