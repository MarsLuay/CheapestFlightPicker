import { describe, expect, it, vi } from "vitest";

import {
  GoogleFlightsUnavailableError
} from "./client";
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

function wrapPageResponse(entries: unknown[][]): string {
  const data: unknown[] = Array.from({ length: 6 }, () => null);
  data[2] = [entries];
  return `<script class="ds:1">AF_initDataCallback({key: 'ds:1', hash: '9', data:${JSON.stringify(data)}});</script>`;
}

describe("GoogleFlightsProvider round-trip outbound follow-up cap", () => {
  it("keeps only the cheapest unique outbounds up to the follow-up limit", () => {
    const provider = new GoogleFlightsProvider() as unknown as {
      getRoundTripOutboundCandidates: (
        results: Array<{
          price: number;
          legs: Array<{
            departureAirportCode: string;
            arrivalAirportCode: string;
            airlineCode: string;
            flightNumber: string;
            departureDateTime: string;
            arrivalDateTime: string;
          }>;
        }>,
        origin: string
      ) => Array<{ price: number }>;
    };

    const results = Array.from({ length: 8 }, (_, index) => ({
      price: 100 + index,
      legs: [
        {
          departureAirportCode: "SEA",
          arrivalAirportCode: "JFK",
          airlineCode: "AS",
          flightNumber: String(100 + index),
          departureDateTime: `2026-06-01T0${index}:00:00`,
          arrivalDateTime: `2026-06-01T1${index}:00:00`
        }
      ]
    }));

    const capped = provider.getRoundTripOutboundCandidates(results, "SEA");
    expect(capped).toHaveLength(5);
    expect(capped.map((entry) => entry.price)).toEqual([100, 101, 102, 103, 104]);
  });

  it("uses outbound miles to break equal-price ties when requested", () => {
    const provider = new GoogleFlightsProvider() as unknown as {
      getRoundTripOutboundCandidates: (
        results: Array<{
          price: number;
          legs: Array<{
            departureAirportCode: string;
            arrivalAirportCode: string;
            airlineCode: string;
            flightNumber: string;
            departureDateTime: string;
            arrivalDateTime: string;
          }>;
        }>,
        origin: string,
        prioritizeMileFlights?: boolean
      ) => Array<{ legs: Array<{ flightNumber: string }> }>;
    };
    const sharedLeg = {
      departureAirportCode: "SEA",
      airlineCode: "AS",
      departureDateTime: "2026-06-01T08:00:00",
      arrivalDateTime: "2026-06-01T16:00:00"
    };
    const results = [
      {
        price: 200,
        legs: [
          {
            ...sharedLeg,
            arrivalAirportCode: "PDX",
            flightNumber: "short"
          }
        ]
      },
      {
        price: 200,
        legs: [
          {
            ...sharedLeg,
            arrivalAirportCode: "JFK",
            flightNumber: "long"
          }
        ]
      }
    ];

    expect(
      provider.getRoundTripOutboundCandidates(results, "SEA", true)[0]?.legs[0]
        ?.flightNumber
    ).toBe("long");
  });
});

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

  it("falls back to live Google Flights page data after a wire error", async () => {
    const page = wrapPageResponse([
      buildRawFlight({
        price: 157,
        sellerCode: "AS",
        sellerName: "Alaska",
        durationMinutes: 180,
        legs: [
          buildRawLeg({
            airlineCode: "AS",
            airlineName: "Alaska Airlines",
            flightNumber: "100",
            departureAirportCode: "SEA",
            arrivalAirportCode: "LAX",
            departureDateParts: [2026, 10, 15],
            arrivalDateParts: [2026, 10, 15],
            departureTimeParts: [7, 10],
            arrivalTimeParts: [10, 10],
            durationMinutes: 180
          })
        ]
      })
    ]);
    const provider = new GoogleFlightsProvider() as unknown as {
      client: {
        post: ReturnType<typeof vi.fn>;
        getSearchPage: ReturnType<typeof vi.fn>;
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
      post: vi.fn().mockRejectedValue(new GoogleFlightsUnavailableError(13)),
      getSearchPage: vi.fn().mockResolvedValue(page)
    };
    provider.exactSearchCache = {
      get: vi.fn(() => null),
      set: vi.fn()
    };

    const result = await provider.searchExactFlights({
      tripType: "one_way",
      origin: "SEA",
      destination: "LAX",
      departureDate: "2026-10-15",
      cabinClass: "economy",
      stopsFilter: "any",
      preferDirectBookingOnly: false,
      requireFreeCarryOnBag: false,
      airlines: [],
      passengers: {
        adults: 1,
        children: 0,
        infantsInSeat: 0,
        infantsOnLap: 0
      }
    });

    expect(result[0]?.totalPrice).toBe(157);
    expect(provider.client.getSearchPage).toHaveBeenCalledWith(
      "SEA",
      "LAX",
      "2026-10-15",
      undefined
    );
    expect(provider.exactSearchCache.set).toHaveBeenCalledWith(
      expect.anything(),
      expect.arrayContaining([expect.objectContaining({ totalPrice: 157 })])
    );
  });

  it("does not cache an empty page as success after a wire error", async () => {
    const provider = new GoogleFlightsProvider() as unknown as {
      client: {
        post: ReturnType<typeof vi.fn>;
        getSearchPage: ReturnType<typeof vi.fn>;
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
      post: vi.fn().mockRejectedValue(new GoogleFlightsUnavailableError(13)),
      getSearchPage: vi.fn().mockResolvedValue("<html>No priced flights</html>")
    };
    provider.exactSearchCache = {
      get: vi.fn(() => null),
      set: vi.fn()
    };

    await expect(
      provider.searchExactFlights({
        tripType: "one_way",
        origin: "SEA",
        destination: "LAX",
        departureDate: "2026-10-15",
        cabinClass: "economy",
        stopsFilter: "any",
        requireFreeCarryOnBag: false,
        airlines: [],
        passengers: {
          adults: 1,
          children: 0,
          infantsInSeat: 0,
          infantsOnLap: 0
        }
      })
    ).rejects.toMatchObject({
      name: "GoogleFlightsUnavailableError"
    });
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

  it("keeps searching outbound follow-ups beyond the first three candidates", async () => {
    const outboundResponse = wrapShoppingResponse([
      buildRawFlight({
        price: 160,
        sellerCode: "AA",
        sellerName: "American",
        durationMinutes: 320,
        legs: [
          buildRawLeg({
            airlineCode: "AA",
            airlineName: "American Airlines",
            flightNumber: "101",
            departureAirportCode: "SEA",
            arrivalAirportCode: "PIT",
            departureDateParts: [2026, 5, 12],
            arrivalDateParts: [2026, 5, 12],
            departureTimeParts: [7, 0],
            arrivalTimeParts: [15, 20],
            durationMinutes: 320
          })
        ]
      }),
      buildRawFlight({
        price: 170,
        sellerCode: "AA",
        sellerName: "American",
        durationMinutes: 330,
        legs: [
          buildRawLeg({
            airlineCode: "AA",
            airlineName: "American Airlines",
            flightNumber: "102",
            departureAirportCode: "SEA",
            arrivalAirportCode: "PIT",
            departureDateParts: [2026, 5, 12],
            arrivalDateParts: [2026, 5, 12],
            departureTimeParts: [8, 0],
            arrivalTimeParts: [16, 30],
            durationMinutes: 330
          })
        ]
      }),
      buildRawFlight({
        price: 180,
        sellerCode: "AA",
        sellerName: "American",
        durationMinutes: 340,
        legs: [
          buildRawLeg({
            airlineCode: "AA",
            airlineName: "American Airlines",
            flightNumber: "103",
            departureAirportCode: "SEA",
            arrivalAirportCode: "PIT",
            departureDateParts: [2026, 5, 12],
            arrivalDateParts: [2026, 5, 12],
            departureTimeParts: [9, 0],
            arrivalTimeParts: [17, 40],
            durationMinutes: 340
          })
        ]
      }),
      buildRawFlight({
        price: 190,
        sellerCode: "AA",
        sellerName: "American",
        durationMinutes: 350,
        legs: [
          buildRawLeg({
            airlineCode: "AA",
            airlineName: "American Airlines",
            flightNumber: "104",
            departureAirportCode: "SEA",
            arrivalAirportCode: "PIT",
            departureDateParts: [2026, 5, 12],
            arrivalDateParts: [2026, 5, 12],
            departureTimeParts: [10, 0],
            arrivalTimeParts: [18, 50],
            durationMinutes: 350
          })
        ]
      })
    ]);
    const followUpResponses = [
      wrapShoppingResponse([
        buildRawFlight({
          price: 420,
          sellerCode: "AA",
          sellerName: "American",
          durationMinutes: 325,
          legs: [
            buildRawLeg({
              airlineCode: "AA",
              airlineName: "American Airlines",
              flightNumber: "201",
              departureAirportCode: "PIT",
              arrivalAirportCode: "SEA",
              departureDateParts: [2026, 5, 23],
              arrivalDateParts: [2026, 5, 23],
              departureTimeParts: [12, 0],
              arrivalTimeParts: [18, 0],
              durationMinutes: 325
            })
          ]
        })
      ]),
      wrapShoppingResponse([
        buildRawFlight({
          price: 400,
          sellerCode: "AA",
          sellerName: "American",
          durationMinutes: 326,
          legs: [
            buildRawLeg({
              airlineCode: "AA",
              airlineName: "American Airlines",
              flightNumber: "202",
              departureAirportCode: "PIT",
              arrivalAirportCode: "SEA",
              departureDateParts: [2026, 5, 23],
              arrivalDateParts: [2026, 5, 23],
              departureTimeParts: [13, 0],
              arrivalTimeParts: [19, 0],
              durationMinutes: 326
            })
          ]
        })
      ]),
      wrapShoppingResponse([
        buildRawFlight({
          price: 380,
          sellerCode: "AA",
          sellerName: "American",
          durationMinutes: 327,
          legs: [
            buildRawLeg({
              airlineCode: "AA",
              airlineName: "American Airlines",
              flightNumber: "203",
              departureAirportCode: "PIT",
              arrivalAirportCode: "SEA",
              departureDateParts: [2026, 5, 23],
              arrivalDateParts: [2026, 5, 23],
              departureTimeParts: [14, 0],
              arrivalTimeParts: [20, 0],
              durationMinutes: 327
            })
          ]
        })
      ]),
      wrapShoppingResponse([
        buildRawFlight({
          price: 240,
          sellerCode: "AA",
          sellerName: "American",
          durationMinutes: 328,
          legs: [
            buildRawLeg({
              airlineCode: "AA",
              airlineName: "American Airlines",
              flightNumber: "204",
              departureAirportCode: "PIT",
              arrivalAirportCode: "SEA",
              departureDateParts: [2026, 5, 23],
              arrivalDateParts: [2026, 5, 23],
              departureTimeParts: [15, 0],
              arrivalTimeParts: [21, 0],
              durationMinutes: 328
            })
          ]
        })
      ])
    ];
    let callIndex = 0;
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
      post: vi.fn(() => {
        const response =
          callIndex === 0
            ? outboundResponse
            : followUpResponses[callIndex - 1];
        callIndex += 1;
        return Promise.resolve(response);
      })
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

    expect(result).toHaveLength(4);
    expect(result[0]?.totalPrice).toBe(420);
    expect(result[3]?.totalPrice).toBe(240);
    expect(Math.min(...result.map((option) => option.totalPrice))).toBe(240);
    expect(provider.client.post).toHaveBeenCalledTimes(5);
  });

  it("preserves itinerary-local leg times instead of converting them through UTC", async () => {
    const response = wrapShoppingResponse([
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
      post: vi.fn().mockResolvedValueOnce(response)
    };
    provider.exactSearchCache = {
      get: vi.fn(() => null),
      set: vi.fn()
    };

    const result = await provider.searchExactFlights({
      tripType: "one_way",
      origin: "SEA",
      destination: "ORD",
      departureDate: "2026-05-12",
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

    expect(result[0]?.slices[0]?.legs[0]?.departureDateTime).toBe(
      "2026-05-12T07:10:00"
    );
    expect(result[0]?.slices[0]?.legs[0]?.arrivalDateTime).toBe(
      "2026-05-12T13:27:00"
    );
  });
});
