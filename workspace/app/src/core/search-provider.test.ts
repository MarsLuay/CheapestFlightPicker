import { afterEach, describe, expect, it } from "vitest";

import { createFlightSearchProvider } from "./search-provider";

const originalVercel = process.env.VERCEL;

describe("createFlightSearchProvider", () => {
  afterEach(() => {
    if (originalVercel === undefined) {
      delete process.env.VERCEL;
    } else {
      process.env.VERCEL = originalVercel;
    }
  });

  it("uses the Google provider path even in hosted runtime", () => {
    process.env.VERCEL = "1";

    const provider = createFlightSearchProvider();

    expect(typeof provider.searchExactFlights).toBe("function");
    expect(typeof provider.searchOneWayWithinWindow).toBe("function");
  });

  it("still allows the local Google provider path by default", () => {
    delete process.env.VERCEL;

    const provider = createFlightSearchProvider();

    expect(typeof provider.searchExactFlights).toBe("function");
    expect(typeof provider.searchOneWayWithinWindow).toBe("function");
  });
});
