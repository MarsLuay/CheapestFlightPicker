import { describe, expect, it } from "vitest";

import {
  parseCalendarResponse,
  parseExactSearchResponse
} from "./parsing";

describe("Google Flights Parsing", () => {
  describe("parseCalendarResponse", () => {
    it("handles empty or invalid inputs", () => {
      expect(() => parseCalendarResponse("")).toThrow();
      expect(parseCalendarResponse(")]}'\n[]")).toEqual([]);
      expect(parseCalendarResponse(")]}'\n[[null, null, null]]")).toEqual([]);
      expect(
        parseCalendarResponse(`)]}'\n[[null, null, ${JSON.stringify(JSON.stringify({}))}]]`)
      ).toEqual([]);
      expect(
        parseCalendarResponse(`)]}'\n[[null, null, ${JSON.stringify(JSON.stringify([]))}]]`)
      ).toEqual([]);
    });

    it("parses valid calendar response and extracts prices", () => {
      const decoded = [
        [
          ["2025-01-01", null, [[null, 100]]],
          ["2025-01-02", null, [[null, "150.5"]]],
          ["2025-01-03", null, [[null, null]]],
          "not an array"
        ]
      ];
      const parsed = JSON.stringify(decoded);
      const payload = `)]}'\n[[null, null, ${JSON.stringify(parsed)}]]`;

      const result = parseCalendarResponse(payload);

      expect(result).toEqual([
        { date: "2025-01-01", price: 100 },
        { date: "2025-01-02", price: 150.5 }
      ]);
    });

    it("sorts entries by date", () => {
      const decoded = [
        [
          ["2025-02-01", null, [[null, 200]]],
          ["2024-12-01", null, [[null, 100]]]
        ]
      ];
      const parsed = JSON.stringify(decoded);
      const payload = `)]}'\n[[null, null, ${JSON.stringify(parsed)}]]`;

      const result = parseCalendarResponse(payload);

      expect(result).toEqual([
        { date: "2024-12-01", price: 100 },
        { date: "2025-02-01", price: 200 }
      ]);
    });
  });

  describe("parseExactSearchResponse", () => {
    it("handles empty or invalid strings", () => {
      expect(() => parseExactSearchResponse("")).toThrow();
      expect(parseExactSearchResponse(")]}'\n[]")).toEqual([]);
      expect(parseExactSearchResponse(")]}'\n[[null, null, null]]")).toEqual([]);
      expect(
        parseExactSearchResponse(`)]}'\n[[null, null, ${JSON.stringify(JSON.stringify({}))}]]`)
      ).toEqual([]);
    });

    it("parses valid flight entries with direct airline booking source", () => {
      const decoded = {
        "2": [
          [
            [
              [
                null,
                null,
                [
                  [
                    null, null, null,
                    "JFK", null, null, "LHR", null,
                    [12, 30], null, [20, 15], 465,
                    null, null, null, null, null, null, null, null,
                    [2025, 5, 1], [2025, 5, 1],
                    ["BA", "123", null, "British Airways"]
                  ]
                ],
                null, null, null, null, null, null,
                465,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                [
                  ["BA", "British Airways", "https://britishairways.com"]
                ]
              ],
              [
                [null, null, null, 500]
              ]
            ]
          ]
        ]
      };

      const parsed = JSON.stringify(decoded);
      const payload = `)]}'\n[[null, null, ${JSON.stringify(parsed)}]]`;

      const result = parseExactSearchResponse(payload);

      expect(result).toEqual([
        {
          bookingSource: {
            type: "direct_airline",
            label: "Direct with British Airways",
            sellerName: "British Airways",
            url: "https://britishairways.com",
            detected: true
          },
          price: 500,
          durationMinutes: 465,
          stops: 0,
          legs: [
            {
              airlineCode: "BA",
              airlineName: "British Airways",
              flightNumber: "123",
              departureAirportCode: "JFK",
              arrivalAirportCode: "LHR",
              departureDateTime: "2025-05-01T12:30:00",
              arrivalDateTime: "2025-05-01T20:15:00",
              durationMinutes: 465
            }
          ]
        }
      ]);
    });

    it("parses valid flight entries with known OTA booking source", () => {
      const decoded = {
        "3": [
          [
            [
              [
                null,
                null,
                [
                  [
                    null, null, null,
                    "JFK", null, null, "LHR", null,
                    [12, 30], null, [20, 15], 465,
                    null, null, null, null, null, null, null, null,
                    [2025, 5, 1], [2025, 5, 1],
                    ["BA", "123", null, "British Airways"]
                  ]
                ],
                null, null, null, null, null, null,
                465,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                [
                  [null, "Expedia", "https://expedia.com"]
                ]
              ],
              [
                [null, null, null, 400]
              ]
            ]
          ]
        ]
      };

      const parsed = JSON.stringify(decoded);
      const payload = `)]}'\n[[null, null, ${JSON.stringify(parsed)}]]`;

      const result = parseExactSearchResponse(payload);

      expect(result).toEqual([
        {
          bookingSource: {
            type: "ota",
            label: "OTA: Expedia",
            sellerName: "Expedia",
            url: "https://expedia.com",
            detected: true
          },
          price: 400,
          durationMinutes: 465,
          stops: 0,
          legs: [
            {
              airlineCode: "BA",
              airlineName: "British Airways",
              flightNumber: "123",
              departureAirportCode: "JFK",
              arrivalAirportCode: "LHR",
              departureDateTime: "2025-05-01T12:30:00",
              arrivalDateTime: "2025-05-01T20:15:00",
              durationMinutes: 465
            }
          ]
        }
      ]);
    });

    it("returns unknown booking source if candidate is missing", () => {
      const decoded = {
        "2": [
          [
            [
              [
                null,
                null,
                [
                  [
                    null, null, null,
                    "JFK", null, null, "LHR", null,
                    [12, 30], null, [20, 15], 465,
                    null, null, null, null, null, null, null, null,
                    [2025, 5, 1], [2025, 5, 1],
                    ["BA", "123", null, "British Airways"]
                  ]
                ],
                null, null, null, null, null, null,
                465
                // route[24] is missing
              ],
              [
                [null, null, null, 500]
              ]
            ]
          ]
        ]
      };

      const parsed = JSON.stringify(decoded);
      const payload = `)]}'\n[[null, null, ${JSON.stringify(parsed)}]]`;

      const result = parseExactSearchResponse(payload);

      expect(result[0]?.bookingSource.type).toBe("unknown");
    });

    it("handles multiple legs with correct stop counts", () => {
      const decoded = {
        "2": [
          [
            [
              [
                null,
                null,
                [
                  [
                    null, null, null,
                    "JFK", null, null, "LHR", null,
                    [12, 30], null, [20, 15], 465,
                    null, null, null, null, null, null, null, null,
                    [2025, 5, 1], [2025, 5, 1],
                    ["BA", "123", null, "British Airways"]
                  ],
                  [
                    null, null, null,
                    "LHR", null, null, "CDG", null,
                    [22, 30], null, [23, 15], 45,
                    null, null, null, null, null, null, null, null,
                    [2025, 5, 1], [2025, 5, 1],
                    ["AF", "456", null, "Air France"]
                  ]
                ],
                null, null, null, null, null, null,
                600,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                [
                  ["BA", "British Airways", "https://britishairways.com"]
                ]
              ],
              [
                [null, null, null, 500]
              ]
            ]
          ]
        ]
      };

      const parsed = JSON.stringify(decoded);
      const payload = `)]}'\n[[null, null, ${JSON.stringify(parsed)}]]`;

      const result = parseExactSearchResponse(payload);

      expect(result).toHaveLength(1);
      expect(result[0]?.stops).toBe(1);
      expect(result[0]?.legs).toHaveLength(2);
    });

    it("skips invalid flight entries", () => {
      const decoded = {
        "2": [
          [
            [
              [
                null, null, [] // invalid legs
              ],
              [
                [null, null, null, 500]
              ]
            ],
            null,
            "not a flight"
          ]
        ]
      };

      const parsed = JSON.stringify(decoded);
      const payload = `)]}'\n[[null, null, ${JSON.stringify(parsed)}]]`;

      const result = parseExactSearchResponse(payload);

      expect(result).toEqual([]);
    });
  });
});
