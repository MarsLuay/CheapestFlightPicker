import { describe, expect, it, vi } from "vitest";

import { AmadeusFlightSearchProvider } from "./provider";

describe("AmadeusFlightSearchProvider", () => {
  it("maps a one-way offer into a flight option and filters by requested windows", async () => {
    const provider = new AmadeusFlightSearchProvider({
      searchFlightOffers: vi.fn().mockResolvedValue([
        {
          validatingAirlineCodes: ["UA"],
          price: {
            currency: "USD",
            total: "189.00"
          },
          itineraries: [
            {
              duration: "PT2H45M",
              segments: [
                {
                  departure: {
                    iataCode: "SEA",
                    at: "2026-05-20T17:45:00"
                  },
                  arrival: {
                    iataCode: "LAX",
                    at: "2026-05-20T20:30:00"
                  },
                  carrierCode: "UA",
                  duration: "PT2H45M",
                  number: "1730"
                }
              ]
            }
          ]
        }
      ])
    });

    const options = await provider.searchExactFlights({
      tripType: "one_way",
      origin: "SEA",
      destination: "LAX",
      departureDate: "2026-05-20",
      cabinClass: "economy",
      stopsFilter: "any",
      preferDirectBookingOnly: false,
      requireFreeCarryOnBag: true,
      airlines: [],
      passengers: {
        adults: 1,
        children: 0,
        infantsInSeat: 0,
        infantsOnLap: 0
      },
      departureTimeWindow: {
        from: 17,
        to: 18
      },
      arrivalTimeWindow: {
        from: 20,
        to: 21
      }
    });

    expect(options).toHaveLength(1);
    expect(options[0]?.totalPrice).toBe(189);
    expect(options[0]?.bookingSource.label).toBe("Direct with United Airlines");
    expect(options[0]?.slices[0]?.stops).toBe(0);
  });

  it("filters out offers that exceed the stop limit", async () => {
    const provider = new AmadeusFlightSearchProvider({
      searchFlightOffers: vi.fn().mockResolvedValue([
        {
          validatingAirlineCodes: ["UA"],
          price: {
            currency: "USD",
            total: "189.00"
          },
          itineraries: [
            {
              duration: "PT5H00M",
              segments: [
                {
                  departure: {
                    iataCode: "SEA",
                    at: "2026-05-20T07:00:00"
                  },
                  arrival: {
                    iataCode: "SFO",
                    at: "2026-05-20T09:00:00"
                  },
                  carrierCode: "UA",
                  duration: "PT2H00M",
                  number: "100"
                },
                {
                  departure: {
                    iataCode: "SFO",
                    at: "2026-05-20T10:00:00"
                  },
                  arrival: {
                    iataCode: "LAX",
                    at: "2026-05-20T12:00:00"
                  },
                  carrierCode: "UA",
                  duration: "PT2H00M",
                  number: "200"
                }
              ]
            }
          ]
        }
      ])
    });

    const options = await provider.searchExactFlights({
      tripType: "one_way",
      origin: "SEA",
      destination: "LAX",
      departureDate: "2026-05-20",
      cabinClass: "economy",
      stopsFilter: "nonstop",
      preferDirectBookingOnly: false,
      requireFreeCarryOnBag: true,
      airlines: [],
      passengers: {
        adults: 1,
        children: 0,
        infantsInSeat: 0,
        infantsOnLap: 0
      }
    });

    expect(options).toEqual([]);
  });
});
