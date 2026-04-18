import { afterEach, describe, expect, it } from "vitest";

import { createFlightSearchProvider } from "./search-provider";

const originalSearchProvider = process.env.SEARCH_PROVIDER;
const originalVercel = process.env.VERCEL;

describe("createFlightSearchProvider", () => {
  afterEach(() => {
    if (originalSearchProvider === undefined) {
      delete process.env.SEARCH_PROVIDER;
    } else {
      process.env.SEARCH_PROVIDER = originalSearchProvider;
    }

    if (originalVercel === undefined) {
      delete process.env.VERCEL;
    } else {
      process.env.VERCEL = originalVercel;
    }

    delete process.env.AMADEUS_CLIENT_ID;
    delete process.env.AMADEUS_CLIENT_SECRET;
    delete process.env.AMADEUS_BASE_URL;
  });

  it("returns a clear hosted-mode error when Vercel has no official provider configured", async () => {
    process.env.VERCEL = "1";
    delete process.env.AMADEUS_CLIENT_ID;
    delete process.env.AMADEUS_CLIENT_SECRET;

    const provider = createFlightSearchProvider();

    await expect(
      provider.searchOneWayWithinWindow(
        {
          tripType: "one_way",
          origin: "SEA",
          destination: "LAX",
          departureDateFrom: "2026-05-20",
          departureDateTo: "2026-05-20",
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
          maxResults: 1
        },
        "SEA",
        "LAX",
        "2026-05-20",
        "2026-05-20"
      )
    ).rejects.toThrow(
      "Hosted search is not configured yet. Google Flights rate limits Vercel/serverless traffic, so add AMADEUS_CLIENT_ID and AMADEUS_CLIENT_SECRET to the Vercel project env vars or run the app locally."
    );
  });

  it("still allows the local Google provider path by default", () => {
    delete process.env.VERCEL;
    delete process.env.SEARCH_PROVIDER;

    const provider = createFlightSearchProvider();

    expect(typeof provider.searchExactFlights).toBe("function");
    expect(typeof provider.searchOneWayWithinWindow).toBe("function");
  });
});
