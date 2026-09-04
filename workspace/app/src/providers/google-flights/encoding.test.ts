import { describe, expect, it } from "vitest";
import { encodeCalendarSearch, encodeExactSearch } from "./encoding";
import type { CalendarSearchParams, ExactFlightSearchParams } from "./types";

describe("encoding", () => {
  describe("encodeCalendarSearch", () => {
    it("encodes basic calendar search", () => {
      const params: CalendarSearchParams = {
        origin: "SEA",
        destination: "JFK",
        fromDate: "2024-01-01",
        toDate: "2024-01-31",
        travelDate: "2024-01-15",
        cabinClass: "economy",
        stopsFilter: "any",
        airlines: [],
        passengers: {
          adults: 1,
          children: 0,
          infantsOnLap: 0,
          infantsInSeat: 0
        }
      };

      const result = encodeCalendarSearch(params);
      expect(typeof result).toBe("string");

      const decoded = JSON.parse(decodeURIComponent(result));
      const payload = JSON.parse(decoded[1]);

      expect(payload[2][0]).toBe("2024-01-01");
      expect(payload[2][1]).toBe("2024-01-31");

      const segment = payload[1][13][0];
      expect(segment[0][0][0][0]).toBe("SEA");
      expect(segment[1][0][0][0]).toBe("JFK");
      expect(segment[6]).toBe("2024-01-15");
      expect(segment[4]).toBeNull(); // airlines
      expect(segment[3]).toBe(0); // stops filter "any" maps to 0 based on stopFilterToGoogleValue
    });

    it("encodes calendar search with time windows, stops filter, and airlines", () => {
      const params: CalendarSearchParams = {
        origin: "SEA",
        destination: "JFK",
        fromDate: "2024-01-01",
        toDate: "2024-01-31",
        travelDate: "2024-01-15",
        cabinClass: "economy",
        stopsFilter: "nonstop",
        airlines: ["DL", "AA"],
        passengers: {
          adults: 1,
          children: 0,
          infantsOnLap: 0,
          infantsInSeat: 0
        },
        departureTimeWindow: {
          from: 8,
          to: 12
        },
        arrivalTimeWindow: {
          from: 14,
          to: 20
        }
      };

      const result = encodeCalendarSearch(params);
      const decoded = JSON.parse(decodeURIComponent(result));
      const payload = JSON.parse(decoded[1]);

      const segment = payload[1][13][0];
      expect(segment[3]).toBe(1); // stops filter "nonstop"
      expect(segment[4]).toEqual(["AA", "DL"]); // airlines sorted
      expect(segment[2]).toEqual([8, 12, 14, 20]); // time filters
    });

    it("encodes calendar search with only departure time window", () => {
      const params: CalendarSearchParams = {
        origin: "SEA",
        destination: "JFK",
        fromDate: "2024-01-01",
        toDate: "2024-01-31",
        travelDate: "2024-01-15",
        cabinClass: "economy",
        stopsFilter: "any",
        airlines: [],
        passengers: {
          adults: 1,
          children: 0,
          infantsOnLap: 0,
          infantsInSeat: 0
        },
        departureTimeWindow: {
          from: 8,
          to: 12
        }
      };

      const result = encodeCalendarSearch(params);
      const decoded = JSON.parse(decodeURIComponent(result));
      const payload = JSON.parse(decoded[1]);

      const segment = payload[1][13][0];
      expect(segment[2]).toEqual([8, 12, null, null]); // time filters
    });

    it("encodes calendar search with only arrival time window", () => {
      const params: CalendarSearchParams = {
        origin: "SEA",
        destination: "JFK",
        fromDate: "2024-01-01",
        toDate: "2024-01-31",
        travelDate: "2024-01-15",
        cabinClass: "economy",
        stopsFilter: "any",
        airlines: [],
        passengers: {
          adults: 1,
          children: 0,
          infantsOnLap: 0,
          infantsInSeat: 0
        },
        arrivalTimeWindow: {
          from: 14,
          to: 20
        }
      };

      const result = encodeCalendarSearch(params);
      const decoded = JSON.parse(decodeURIComponent(result));
      const payload = JSON.parse(decoded[1]);

      const segment = payload[1][13][0];
      expect(segment[2]).toEqual([null, null, 14, 20]); // time filters
    });

    it("encodes calendar search with passengers", () => {
      const params: CalendarSearchParams = {
        origin: "SEA",
        destination: "JFK",
        fromDate: "2024-01-01",
        toDate: "2024-01-31",
        travelDate: "2024-01-15",
        cabinClass: "economy",
        stopsFilter: "any",
        airlines: [],
        passengers: {
          adults: 2,
          children: 1,
          infantsOnLap: 1,
          infantsInSeat: 0
        }
      };

      const result = encodeCalendarSearch(params);
      const decoded = JSON.parse(decodeURIComponent(result));
      const payload = JSON.parse(decoded[1]);

      const passengers = payload[1][6];
      expect(passengers).toEqual([2, 1, 1, 0]);
    });
  });

  describe("encodeExactSearch", () => {
    it("encodes a basic one-way flight", () => {
      const params: ExactFlightSearchParams = {
        tripType: "one_way",
        origin: "SEA",
        destination: "JFK",
        departureDate: "2024-01-15",
        cabinClass: "economy",
        stopsFilter: "any",
        airlines: [],
        passengers: {
          adults: 1,
          children: 0,
          infantsOnLap: 0,
          infantsInSeat: 0
        }
      };

      const result = encodeExactSearch(params);
      expect(typeof result).toBe("string");

      const decoded = JSON.parse(decodeURIComponent(result));
      const payload = JSON.parse(decoded[1]);

      const segments = payload[1][13];
      expect(segments).toHaveLength(1);

      const segment = segments[0];
      expect(segment[0][0][0][0]).toBe("SEA");
      expect(segment[1][0][0][0]).toBe("JFK");
      expect(segment[6]).toBe("2024-01-15");
      expect(payload[1][2]).toBe(2); // 2 means one-way trip
    });

    it("encodes a round trip flight", () => {
      const params: ExactFlightSearchParams = {
        tripType: "round_trip",
        origin: "SEA",
        destination: "JFK",
        departureDate: "2024-01-15",
        returnDate: "2024-01-20",
        cabinClass: "economy",
        stopsFilter: "any",
        airlines: [],
        passengers: {
          adults: 1,
          children: 0,
          infantsOnLap: 0,
          infantsInSeat: 0
        }
      };

      const result = encodeExactSearch(params);
      const decoded = JSON.parse(decodeURIComponent(result));
      const payload = JSON.parse(decoded[1]);

      const segments = payload[1][13];
      expect(segments).toHaveLength(2);

      const segment1 = segments[0];
      expect(segment1[0][0][0][0]).toBe("SEA");
      expect(segment1[1][0][0][0]).toBe("JFK");
      expect(segment1[6]).toBe("2024-01-15");

      const segment2 = segments[1];
      expect(segment2[0][0][0][0]).toBe("JFK");
      expect(segment2[1][0][0][0]).toBe("SEA");
      expect(segment2[6]).toBe("2024-01-20");

      expect(payload[1][2]).toBe(1); // 1 means round-trip
    });

    it("encodes exact search with selectedFlight", () => {
      const params: ExactFlightSearchParams = {
        tripType: "round_trip",
        origin: "SEA",
        destination: "JFK",
        departureDate: "2024-01-15",
        returnDate: "2024-01-20",
        cabinClass: "economy",
        stopsFilter: "any",
        airlines: [],
        passengers: {
          adults: 1,
          children: 0,
          infantsOnLap: 0,
          infantsInSeat: 0
        },
        selectedFlight: {
          price: 100,
          durationMinutes: 300,
          stops: 0,
          bookingSource: {
            type: "direct_airline",
            label: "Delta",
            detected: true,
            url: "https://example.com",
            sellerName: "Delta"
          },
          legs: [
            {
              departureAirportCode: "SEA",
              arrivalAirportCode: "JFK",
              departureDateTime: "2024-01-15T08:00:00",
              arrivalDateTime: "2024-01-15T16:00:00",
              airlineCode: "DL",
              airlineName: "Delta Air Lines",
              flightNumber: "123",
              durationMinutes: 300
            }
          ]
        }
      };

      const result = encodeExactSearch(params);
      const decoded = JSON.parse(decodeURIComponent(result));
      const payload = JSON.parse(decoded[1]);

      const segments = payload[1][13];
      const segment1 = segments[0];

      const selectedFlights = segment1[8];
      expect(selectedFlights).toHaveLength(1);

      const selectedFlight = selectedFlights[0];
      expect(selectedFlight[0]).toBe("SEA");
      expect(selectedFlight[1]).toBe("2024-01-15"); // local date part
      expect(selectedFlight[2]).toBe("JFK");
      expect(selectedFlight[3]).toBeNull();
      expect(selectedFlight[4]).toBe("DL");
      expect(selectedFlight[5]).toBe("123");
    });

    it("encodes exact search with selectedFlight and improperly formatted departureDateTime", () => {
      const params: ExactFlightSearchParams = {
        tripType: "one_way",
        origin: "SEA",
        destination: "JFK",
        departureDate: "2024-01-15",
        cabinClass: "economy",
        stopsFilter: "any",
        airlines: [],
        passengers: {
          adults: 1,
          children: 0,
          infantsOnLap: 0,
          infantsInSeat: 0
        },
        selectedFlight: {
          price: 100,
          durationMinutes: 300,
          stops: 0,
          bookingSource: {
            type: "direct_airline",
            label: "Delta",
            detected: true,
            url: "https://example.com",
            sellerName: "Delta"
          },
          legs: [
            {
              departureAirportCode: "SEA",
              arrivalAirportCode: "JFK",
              departureDateTime: "invalid-date",
              arrivalDateTime: "2024-01-15T16:00:00",
              airlineCode: "DL",
              airlineName: "Delta Air Lines",
              flightNumber: "123",
              durationMinutes: 300
            }
          ]
        }
      };

      const result = encodeExactSearch(params);
      const decoded = JSON.parse(decodeURIComponent(result));
      const payload = JSON.parse(decoded[1]);

      const segments = payload[1][13];
      const segment1 = segments[0];

      const selectedFlights = segment1[8];
      const selectedFlight = selectedFlights[0];
      // Should fallback to the travelDate provided (departureDate in this case)
      expect(selectedFlight[1]).toBe("2024-01-15");
    });
  });
});
