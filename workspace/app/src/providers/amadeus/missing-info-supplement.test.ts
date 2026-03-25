import { describe, expect, it } from "vitest";

import {
  AmadeusMissingInfoSupplementProvider,
  matchAmadeusOffer
} from "./missing-info-supplement";
import type { FlightOption, SearchRequest } from "../../shared/types";

type SupplementLogEntry = {
  details?: Record<string, unknown>;
  level: "info" | "error";
  message: string;
};

type MemoryNegativeCache = {
  get(key: unknown): { status: "miss" } | null;
  set(key: unknown, value: { status: "miss" }): void;
};

function buildRequest(): SearchRequest {
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
    maxResults: 5
  };
}

function buildOption(): FlightOption {
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
    outboundDate: "2026-06-01"
  };
}

function createMemoryNegativeCache(): MemoryNegativeCache {
  const entries = new Map<string, { status: "miss" }>();

  return {
    get(key) {
      return entries.get(JSON.stringify(key)) ?? null;
    },
    set(key, value) {
      entries.set(JSON.stringify(key), value);
    }
  };
}

function createLogger(entries: SupplementLogEntry[]) {
  return (
    level: "info" | "error",
    message: string,
    details?: Record<string, unknown>
  ) => {
    entries.push({
      level,
      message,
      details
    });
  };
}

function createTimeoutError(message = "timeout exceeded"): unknown {
  return {
    isAxiosError: true,
    code: "ECONNABORTED",
    message
  };
}

function createRateLimitError(message = "rate limited"): unknown {
  return {
    isAxiosError: true,
    message,
    response: {
      status: 429
    }
  };
}

describe("matchAmadeusOffer", () => {
  it("matches offers by itinerary structure, route, and flight number", () => {
    const option = buildOption();
    const offer = matchAmadeusOffer(option, [
      {
        validatingAirlineCodes: ["DL"],
        itineraries: [
          {
            segments: [
              {
                departure: {
                  iataCode: "SEA"
                },
                arrival: {
                  iataCode: "JFK"
                },
                carrierCode: "DL",
                number: "123"
              }
            ]
          }
        ]
      }
    ]);

    expect(offer?.validatingAirlineCodes).toEqual(["DL"]);
  });
});

describe("AmadeusMissingInfoSupplementProvider", () => {
  it("fills sellerName when a matching Amadeus offer identifies one validating airline", async () => {
    const option = buildOption();
    const request = buildRequest();
    const provider = new AmadeusMissingInfoSupplementProvider({
      async searchFlightOffers() {
        return [
          {
            validatingAirlineCodes: ["DL"],
            itineraries: [
              {
                segments: [
                  {
                    departure: {
                      iataCode: "SEA"
                    },
                    arrival: {
                      iataCode: "JFK"
                    },
                    carrierCode: "DL",
                    number: "123"
                  }
                ]
              }
            ]
          }
        ];
      }
    });

    const supplemented = await provider.supplementOption(option, request);

    expect(supplemented?.bookingSource.label).toBe("Booking source not confirmed");
    expect(supplemented?.bookingSource.sellerName).toBe("Delta Air Lines");
  });

  it("negative-caches dead-end lookups so the same itinerary is not re-queried immediately", async () => {
    const option = buildOption();
    const request = buildRequest();
    let calls = 0;
    const provider = new AmadeusMissingInfoSupplementProvider(
      {
        async searchFlightOffers() {
          calls += 1;
          return [];
        }
      },
      createMemoryNegativeCache()
    );

    await provider.supplementOption(option, request);
    await provider.supplementOption(option, request);

    expect(calls).toBe(1);
  });

  it("does not negative-cache transient provider errors", async () => {
    const option = buildOption();
    const request = buildRequest();
    let calls = 0;
    const provider = new AmadeusMissingInfoSupplementProvider(
      {
        async searchFlightOffers() {
          calls += 1;
          throw new Error("temporary failure");
        }
      },
      createMemoryNegativeCache()
    );

    await provider.supplementOption(option, request);
    await provider.supplementOption(option, request);

    expect(calls).toBe(2);
  });

  it("opens the circuit after repeated timeout failures and skips calls until cooldown elapses", async () => {
    const option = buildOption();
    const request = buildRequest();
    const logs: SupplementLogEntry[] = [];
    let calls = 0;
    let now = Date.parse("2026-01-01T00:00:00.000Z");
    const provider = new AmadeusMissingInfoSupplementProvider(
      {
        async searchFlightOffers() {
          calls += 1;
          throw createTimeoutError();
        }
      },
      createMemoryNegativeCache(),
      {
        circuitBreaker: {
          cooldownMs: 60_000,
          failureThreshold: 2
        },
        logger: createLogger(logs),
        now: () => now
      }
    );

    await provider.supplementOption(option, request);
    await provider.supplementOption(option, request);
    await provider.supplementOption(option, request);

    expect(calls).toBe(2);
    expect(
      logs.some((entry) => entry.message === "Amadeus missing-info supplement circuit opened")
    ).toBe(true);

    now += 60_001;
    await provider.supplementOption(option, request);

    expect(calls).toBe(3);
  });

  it("opens the circuit on repeated rate limiting and logs the failure details", async () => {
    const option = buildOption();
    const request = buildRequest();
    const logs: SupplementLogEntry[] = [];
    let calls = 0;
    const provider = new AmadeusMissingInfoSupplementProvider(
      {
        async searchFlightOffers() {
          calls += 1;
          throw createRateLimitError();
        }
      },
      createMemoryNegativeCache(),
      {
        circuitBreaker: {
          cooldownMs: 60_000,
          failureThreshold: 2
        },
        logger: createLogger(logs)
      }
    );

    await provider.supplementOption(option, request);
    await provider.supplementOption(option, request);
    await provider.supplementOption(option, request);

    expect(calls).toBe(2);
    expect(
      logs.some((entry) => entry.message.includes("rate limited failure"))
    ).toBe(true);
    expect(
      logs.some((entry) => entry.details?.failureKind === "rate_limited")
    ).toBe(true);
  });
});
