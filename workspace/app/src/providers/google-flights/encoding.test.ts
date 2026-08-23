import { describe, it, expect } from "vitest";
import { encodeCalendarSearch, encodeExactSearch } from "./encoding";
import type { CalendarSearchParams, ExactFlightSearchParams } from "./types";

function decodeAndParse(encoded: string) {
  const decoded = decodeURIComponent(encoded);
  const wrapper = JSON.parse(decoded);
  return JSON.parse(wrapper[1]);
}

describe("google-flights encoding", () => {
  describe("encodeCalendarSearch", () => {
    it("should correctly encode basic calendar search params", () => {
      const params: CalendarSearchParams = {
        origin: "SFO",
        destination: "LAX",
        fromDate: "2023-11-01",
        toDate: "2023-11-30",
        travelDate: "2023-11-15",
        cabinClass: "economy",
        stopsFilter: "any",
        airlines: [],
        passengers: { adults: 1, children: 0, infantsOnLap: 0, infantsInSeat: 0 },
      };

      const result = encodeCalendarSearch(params);
      const parsed = decodeAndParse(result);

      expect(parsed).toBeDefined();

      const payloadWrapper = parsed[1];
      const segment = payloadWrapper[13][0];

      // Check segment details
      expect(segment[0][0][0][0]).toBe("SFO"); // Origin
      expect(segment[1][0][0][0]).toBe("LAX"); // Destination
      expect(segment[6]).toBe("2023-11-15");   // Travel date

      // Check date range
      const dateRange = parsed[2];
      expect(dateRange).toEqual(["2023-11-01", "2023-11-30"]);

      // Cabin class and passengers
      expect(payloadWrapper[5]).toBe(1); // Economy -> 1
      expect(payloadWrapper[6]).toEqual([1, 0, 0, 0]); // Passengers
    });

    it("should correctly handle time windows and filters in calendar search", () => {
      const params: CalendarSearchParams = {
        origin: "JFK",
        destination: "LHR",
        fromDate: "2023-12-01",
        toDate: "2023-12-31",
        travelDate: "2023-12-15",
        cabinClass: "business",
        stopsFilter: "nonstop",
        airlines: ["DL", "VS"],
        passengers: { adults: 2, children: 1, infantsOnLap: 0, infantsInSeat: 1 },
        departureTimeWindow: { from: 6, to: 12 },
        arrivalTimeWindow: { from: 14, to: 22 },
      };

      const result = encodeCalendarSearch(params);
      const parsed = decodeAndParse(result);

      const payloadWrapper = parsed[1];
      const segment = payloadWrapper[13][0];

      expect(segment[2]).toEqual([6, 12, 14, 22]); // Time windows
      expect(segment[3]).toBe(1); // Nonstop -> 1
      expect(segment[4]).toEqual(["DL", "VS"]); // Airlines (sorted alphabetically implicitly since D, V)

      expect(payloadWrapper[5]).toBe(3); // Business -> 3
      expect(payloadWrapper[6]).toEqual([2, 1, 0, 1]); // Passengers
    });
  });

  describe("encodeExactSearch", () => {
    it("should correctly encode one-way exact search params", () => {
      const params: ExactFlightSearchParams = {
        tripType: "one_way",
        origin: "SEA",
        destination: "PDX",
        departureDate: "2024-01-15",
        cabinClass: "first",
        stopsFilter: "max_1_stop",
        airlines: [],
        passengers: { adults: 1, children: 0, infantsOnLap: 0, infantsInSeat: 0 },
      };

      const result = encodeExactSearch(params);
      const parsed = decodeAndParse(result);

      const payloadWrapper = parsed[1];

      expect(payloadWrapper[2]).toBe(2); // One-way is usually 2
      expect(payloadWrapper[5]).toBe(4); // First class -> 4

      const segments = payloadWrapper[13];
      expect(segments).toHaveLength(1);

      const segment = segments[0];
      expect(segment[0][0][0][0]).toBe("SEA");
      expect(segment[1][0][0][0]).toBe("PDX");
      expect(segment[6]).toBe("2024-01-15");
      expect(segment[3]).toBe(2); // Max 1 stop -> 2
    });

    it("should correctly encode round-trip exact search params", () => {
      const params: ExactFlightSearchParams = {
        tripType: "round_trip",
        origin: "ORD",
        destination: "MIA",
        departureDate: "2024-02-10",
        returnDate: "2024-02-17",
        cabinClass: "premium_economy",
        stopsFilter: "max_2_stops",
        airlines: ["AA"],
        passengers: { adults: 2, children: 2, infantsOnLap: 1, infantsInSeat: 0 },
      };

      const result = encodeExactSearch(params);
      const parsed = decodeAndParse(result);

      const payloadWrapper = parsed[1];
      expect(payloadWrapper[2]).toBe(1); // Round trip -> 1
      expect(payloadWrapper[5]).toBe(2); // Premium Economy -> 2
      expect(payloadWrapper[6]).toEqual([2, 2, 1, 0]);

      const segments = payloadWrapper[13];
      expect(segments).toHaveLength(2);

      const outSegment = segments[0];
      expect(outSegment[0][0][0][0]).toBe("ORD");
      expect(outSegment[1][0][0][0]).toBe("MIA");
      expect(outSegment[6]).toBe("2024-02-10");
      expect(outSegment[3]).toBe(3); // Max 2 stops -> 3
      expect(outSegment[4]).toEqual(["AA"]);

      const returnSegment = segments[1];
      expect(returnSegment[0][0][0][0]).toBe("MIA");
      expect(returnSegment[1][0][0][0]).toBe("ORD");
      expect(returnSegment[6]).toBe("2024-02-17");
      expect(returnSegment[3]).toBe(3);
    });

    it("should correctly handle selectedFlight", () => {
      const params: ExactFlightSearchParams = {
        tripType: "one_way",
        origin: "BOS",
        destination: "SFO",
        departureDate: "2024-03-01",
        cabinClass: "economy",
        stopsFilter: "any",
        airlines: [],
        passengers: { adults: 1, children: 0, infantsOnLap: 0, infantsInSeat: 0 },
        selectedFlight: {
          price: 150,
          durationMinutes: 300,
          stops: 0,
          bookingSource: { type: "direct_airline", label: "Direct Airline", detected: true },
          legs: [
            {
              airlineCode: "B6",
              airlineName: "JetBlue",
              flightNumber: "123",
              departureAirportCode: "BOS",
              arrivalAirportCode: "SFO",
              departureDateTime: "2024-03-01T08:00:00",
              arrivalDateTime: "2024-03-01T11:00:00",
              durationMinutes: 300
            }
          ]
        }
      };

      const result = encodeExactSearch(params);
      const parsed = decodeAndParse(result);

      const segment = parsed[1][13][0];
      const selectedFlightsData = segment[8];

      expect(selectedFlightsData).toBeDefined();
      expect(selectedFlightsData).toHaveLength(1);

      const selectedLeg = selectedFlightsData[0];
      expect(selectedLeg).toEqual([
        "BOS",
        "2024-03-01",
        "SFO",
        null,
        "B6",
        "123"
      ]);
    });
  });
});
