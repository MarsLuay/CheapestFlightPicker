import { describe, expect, it } from "vitest";

import { searchAirports } from "./catalog";

describe("searchAirports", () => {
  it("prioritizes exact IATA code matches", () => {
    const matches = searchAirports("SEA", 5);

    expect(matches[0]?.iata).toBe("SEA");
  });
});
