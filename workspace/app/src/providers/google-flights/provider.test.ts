import { describe, expect, it, vi } from "vitest";

import { GoogleFlightsProvider } from "./provider";
import type { FlightOption } from "../../shared/types";

function buildOption(
  bookingSource: FlightOption["bookingSource"],
  airlineCode = "AS"
): FlightOption {
  return {
    source: "google_one_way",
    totalPrice: 100,
    currency: "USD",
    slices: [
      {
        durationMinutes: 120,
        stops: 0,
        legs: [
          {
            airlineCode,
            airlineName: airlineCode,
            flightNumber: "100",
            departureAirportCode: "SEA",
            departureAirportName: "Seattle-Tacoma International Airport",
            departureDateTime: "2026-06-01T10:00:00.000Z",
            arrivalAirportCode: "JFK",
            arrivalAirportName: "John F. Kennedy International Airport",
            arrivalDateTime: "2026-06-01T18:00:00.000Z",
            durationMinutes: 120
          }
        ]
      }
    ],
    bookingSource
  };
}

function buildRawLeg(params: {
  airlineCode: string;
  airlineName: string;
  flightNumber: string;
  departureAirportCode: string;
  arrivalAirportCode: string;
  departureDateParts: [number, number, number];
  arrivalDateParts: [number, number, number];
  departureTimeParts: [number, number];
  arrivalTimeParts: [number, number];
  durationMinutes: number;
}): unknown[] {
  const leg: unknown[] = [];
  leg[3] = params.departureAirportCode;
  leg[6] = params.arrivalAirportCode;
  leg[8] = params.departureTimeParts;
  leg[10] = params.arrivalTimeParts;
  leg[11] = params.durationMinutes;
  leg[20] = params.departureDateParts;
  leg[21] = params.arrivalDateParts;
  leg[22] = [
    params.airlineCode,
    params.flightNumber,
    null,
    params.airlineName
  ];
  return leg;
}

function buildRawFlight(params: {
  price: number;
  sellerCode: string;
  sellerName: string;
  sellerUrl?: string;
  durationMinutes: number;
  legs: unknown[][];
}): unknown[] {
  const route: unknown[] = [];
  route[2] = params.legs;
  route[9] = params.durationMinutes;
  route[24] = [
    [
      params.sellerCode,
      params.sellerName,
      params.sellerUrl ?? `https://${params.sellerName.toLowerCase()}.example.com`
    ]
  ];

  return [route, [[null, params.price]]];
}

function wrapShoppingResponse(entries: unknown[][]): string {
  const decoded = [null, null, [entries]];
  return `)]}'${JSON.stringify([[null, null, JSON.stringify(decoded)]])}`;
}

describe("GoogleFlightsProvider direct booking preference", () => {
  it("keeps OTA fares when preferDirectBookingOnly is off", () => {
    const provider = new GoogleFlightsProvider() as unknown as {
      applyDirectBookingPreference: (
        options: FlightOption[],
        preferDirectBookingOnly: boolean | undefined
      ) => FlightOption[];
    };

    const options = [
      buildOption({
        type: "direct_airline",
        label: "Direct with Alaska",
        sellerName: "Alaska",
        detected: true
      }),
      buildOption({
        type: "ota",
        label: "OTA: SmartFares",
        sellerName: "SmartFares",
        detected: true
      })
    ];

    expect(provider.applyDirectBookingPreference(options, false)).toEqual(options);
  });

  it("filters OTA fares when preferDirectBookingOnly is on", () => {
    const provider = new GoogleFlightsProvider() as unknown as {
      applyDirectBookingPreference: (
        options: FlightOption[],
        preferDirectBookingOnly: boolean | undefined
      ) => FlightOption[];
    };

    const options = [
      buildOption({
        type: "direct_airline",
        label: "Direct with Alaska",
        sellerName: "Alaska",
        detected: true
      }),
      buildOption({
        type: "ota",
        label: "OTA: SmartFares",
        sellerName: "SmartFares",
        detected: true
      })
    ];

    expect(provider.applyDirectBookingPreference(options, true)).toEqual([
      options[0]
    ]);
  });

  it("filters out economy fares from airlines that do not appear to include a free carry-on bag", () => {
    const provider = new GoogleFlightsProvider() as unknown as {
      applyFreeCarryOnRequirement: (
        options: FlightOption[],
        requireFreeCarryOnBag: boolean | undefined,
        cabinClass: "economy" | "premium_economy" | "business" | "first"
      ) => FlightOption[];
    };

    const options = [
      buildOption(
        {
          type: "direct_airline",
          label: "Direct with Frontier",
          sellerName: "Frontier",
          detected: true
        },
        "F9"
      ),
      buildOption(
        {
          type: "direct_airline",
          label: "Direct with Delta",
          sellerName: "Delta",
          detected: true
        },
        "DL"
      )
    ];

    expect(
      provider.applyFreeCarryOnRequirement(options, true, "economy")
    ).toEqual([options[1]]);
  });

  it("keeps premium-cabin fares when the free carry-on filter is on", () => {
    const provider = new GoogleFlightsProvider() as unknown as {
      applyFreeCarryOnRequirement: (
        options: FlightOption[],
        requireFreeCarryOnBag: boolean | undefined,
        cabinClass: "economy" | "premium_economy" | "business" | "first"
      ) => FlightOption[];
    };

    const options = [
      buildOption(
        {
          type: "direct_airline",
          label: "Direct with Frontier",
          sellerName: "Frontier",
          detected: true
        },
        "F9"
      )
    ];

    expect(
      provider.applyFreeCarryOnRequirement(options, true, "business")
    ).toEqual(options);
  });

  it("returns cached exact-flight results before making a network call", async () => {
    const cachedOptions = [
      buildOption({
        type: "direct_airline",
        label: "Direct with Alaska",
        sellerName: "Alaska",
        detected: true
      })
    ];
    const provider = new GoogleFlightsProvider() as unknown as {
      client: {
        post: ReturnType<typeof vi.fn>;
      };
      exactSearchCache: {
        get: ReturnType<typeof vi.fn>;
        set: ReturnType<typeof vi.fn>;
      };
      searchExactFlights: (
        params: Record<string, unknown>
      ) => Promise<FlightOption[]>;
    };

    provider.client = {
      post: vi.fn()
    };
    provider.exactSearchCache = {
      get: vi.fn(() => cachedOptions),
      set: vi.fn()
    };

    const result = await provider.searchExactFlights({
      tripType: "one_way",
      origin: "SEA",
      destination: "JFK",
      departureDate: "2026-06-01",
      cabinClass: "economy",
      stopsFilter: "any",
      preferDirectBookingOnly: false,
      airlines: [],
      passengers: {
        adults: 1,
        children: 0,
        infantsInSeat: 0,
        infantsOnLap: 0
      }
    });

    expect(result).toBe(cachedOptions);
    expect(provider.client.post).not.toHaveBeenCalled();
    expect(provider.exactSearchCache.set).not.toHaveBeenCalled();
  });

  it("uses the Google-priced full round-trip total instead of double-counting the follow-up leg", async () => {
    const outboundResponse = wrapShoppingResponse([
      buildRawFlight({
        price: 200,
        sellerCode: "AA",
        sellerName: "American",
        durationMinutes: 501,
        legs: [
          buildRawLeg({
            airlineCode: "AA",
            airlineName: "American Airlines",
            flightNumber: "885",
            departureAirportCode: "SEA",
            arrivalAirportCode: "ORD",
            departureDateParts: [2026, 5, 12],
            arrivalDateParts: [2026, 5, 12],
            departureTimeParts: [7, 10],
            arrivalTimeParts: [13, 27],
            durationMinutes: 257
          }),
          buildRawLeg({
            airlineCode: "AA",
            airlineName: "American Airlines",
            flightNumber: "3148",
            departureAirportCode: "ORD",
            arrivalAirportCode: "PIT",
            departureDateParts: [2026, 5, 12],
            arrivalDateParts: [2026, 5, 12],
            departureTimeParts: [15, 47],
            arrivalTimeParts: [18, 31],
            durationMinutes: 104
          })
        ]
      })
    ]);
    const returnResponse = wrapShoppingResponse([
      buildRawFlight({
        price: 239,
        sellerCode: "AA",
        sellerName: "American",
        durationMinutes: 502,
        legs: [
          buildRawLeg({
            airlineCode: "AA",
            airlineName: "American Airlines",
            flightNumber: "2312",
            departureAirportCode: "PIT",
            arrivalAirportCode: "PHL",
            departureDateParts: [2026, 5, 23],
            arrivalDateParts: [2026, 5, 23],
            departureTimeParts: [17, 36],
            arrivalTimeParts: [18, 54],
            durationMinutes: 78
          }),
          buildRawLeg({
            airlineCode: "AA",
            airlineName: "American Airlines",
            flightNumber: "3259",
            departureAirportCode: "PHL",
            arrivalAirportCode: "SEA",
            departureDateParts: [2026, 5, 23],
            arrivalDateParts: [2026, 5, 23],
            departureTimeParts: [19, 35],
            arrivalTimeParts: [22, 58],
            durationMinutes: 383
          })
        ]
      })
    ]);
    const provider = new GoogleFlightsProvider() as unknown as {
      client: {
        post: ReturnType<typeof vi.fn>;
      };
      exactSearchCache: {
        get: ReturnType<typeof vi.fn>;
        set: ReturnType<typeof vi.fn>;
      };
      searchExactFlights: (
        params: Record<string, unknown>
      ) => Promise<FlightOption[]>;
    };

    provider.client = {
      post: vi.fn().mockResolvedValueOnce(outboundResponse).mockResolvedValueOnce(returnResponse)
    };
    provider.exactSearchCache = {
      get: vi.fn(() => null),
      set: vi.fn()
    };

    const result = await provider.searchExactFlights({
      tripType: "round_trip",
      origin: "SEA",
      destination: "PIT",
      departureDate: "2026-05-12",
      returnDate: "2026-05-23",
      cabinClass: "economy",
      stopsFilter: "any",
      preferDirectBookingOnly: false,
      airlines: [],
      passengers: {
        adults: 1,
        children: 0,
        infantsInSeat: 0,
        infantsOnLap: 0
      }
    });

    expect(result[0]?.totalPrice).toBe(239);
    expect(result[0]?.slicePrices).toBeUndefined();
    expect(provider.client.post).toHaveBeenCalledTimes(2);
    expect(provider.exactSearchCache.set).toHaveBeenCalledWith(
      expect.anything(),
      result
    );
  });

  it("keeps mixed-seller returns out of the standard round-trip bucket", async () => {
    const outboundResponse = wrapShoppingResponse([
      buildRawFlight({
        price: 200,
        sellerCode: "AA",
        sellerName: "American",
        durationMinutes: 501,
        legs: [
          buildRawLeg({
            airlineCode: "AA",
            airlineName: "American Airlines",
            flightNumber: "885",
            departureAirportCode: "SEA",
            arrivalAirportCode: "ORD",
            departureDateParts: [2026, 5, 12],
            arrivalDateParts: [2026, 5, 12],
            departureTimeParts: [7, 10],
            arrivalTimeParts: [13, 27],
            durationMinutes: 257
          }),
          buildRawLeg({
            airlineCode: "AA",
            airlineName: "American Airlines",
            flightNumber: "3148",
            departureAirportCode: "ORD",
            arrivalAirportCode: "PIT",
            departureDateParts: [2026, 5, 12],
            arrivalDateParts: [2026, 5, 12],
            departureTimeParts: [15, 47],
            arrivalTimeParts: [18, 31],
            durationMinutes: 104
          })
        ]
      })
    ]);
    const returnResponse = wrapShoppingResponse([
      buildRawFlight({
        price: 200,
        sellerCode: "UA",
        sellerName: "United",
        durationMinutes: 536,
        legs: [
          buildRawLeg({
            airlineCode: "UA",
            airlineName: "United Airlines",
            flightNumber: "436",
            departureAirportCode: "PIT",
            arrivalAirportCode: "SFO",
            departureDateParts: [2026, 5, 23],
            arrivalDateParts: [2026, 5, 23],
            departureTimeParts: [20, 23],
            arrivalTimeParts: [22, 51],
            durationMinutes: 328
          }),
          buildRawLeg({
            airlineCode: "UA",
            airlineName: "United Airlines",
            flightNumber: "1007",
            departureAirportCode: "SFO",
            arrivalAirportCode: "SEA",
            departureDateParts: [2026, 5, 23],
            arrivalDateParts: [2026, 5, 23],
            departureTimeParts: [23, 54],
            arrivalTimeParts: [2, 19],
            durationMinutes: 145
          })
        ]
      }),
      buildRawFlight({
        price: 239,
        sellerCode: "AA",
        sellerName: "American",
        durationMinutes: 502,
        legs: [
          buildRawLeg({
            airlineCode: "AA",
            airlineName: "American Airlines",
            flightNumber: "2312",
            departureAirportCode: "PIT",
            arrivalAirportCode: "PHL",
            departureDateParts: [2026, 5, 23],
            arrivalDateParts: [2026, 5, 23],
            departureTimeParts: [17, 36],
            arrivalTimeParts: [18, 54],
            durationMinutes: 78
          }),
          buildRawLeg({
            airlineCode: "AA",
            airlineName: "American Airlines",
            flightNumber: "3259",
            departureAirportCode: "PHL",
            arrivalAirportCode: "SEA",
            departureDateParts: [2026, 5, 23],
            arrivalDateParts: [2026, 5, 23],
            departureTimeParts: [19, 35],
            arrivalTimeParts: [22, 58],
            durationMinutes: 383
          })
        ]
      })
    ]);
    const provider = new GoogleFlightsProvider() as unknown as {
      client: {
        post: ReturnType<typeof vi.fn>;
      };
      exactSearchCache: {
        get: ReturnType<typeof vi.fn>;
        set: ReturnType<typeof vi.fn>;
      };
      searchExactFlights: (
        params: Record<string, unknown>
      ) => Promise<FlightOption[]>;
    };

    provider.client = {
      post: vi.fn().mockResolvedValueOnce(outboundResponse).mockResolvedValueOnce(returnResponse)
    };
    provider.exactSearchCache = {
      get: vi.fn(() => null),
      set: vi.fn()
    };

    const result = await provider.searchExactFlights({
      tripType: "round_trip",
      origin: "SEA",
      destination: "PIT",
      departureDate: "2026-05-12",
      returnDate: "2026-05-23",
      cabinClass: "economy",
      stopsFilter: "any",
      preferDirectBookingOnly: false,
      airlines: [],
      passengers: {
        adults: 1,
        children: 0,
        infantsInSeat: 0,
        infantsOnLap: 0
      }
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.totalPrice).toBe(239);
    expect(result[0]?.bookingSource.sellerName).toBe("American");
  });
});
