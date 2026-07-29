import { describe, expect, it } from "vitest";

import { parseTypedAirportCode } from "./AirportField";

describe("parseTypedAirportCode", () => {
  it("accepts a 3-letter IATA code and uppercases it", () => {
    expect(parseTypedAirportCode("pit")).toBe("PIT");
    expect(parseTypedAirportCode("  SEA ")).toBe("SEA");
  });

  it("rejects city names and short or long values", () => {
    expect(parseTypedAirportCode("Pittsburgh")).toBeNull();
    expect(parseTypedAirportCode("PI")).toBeNull();
    expect(parseTypedAirportCode("PITT")).toBeNull();
    expect(parseTypedAirportCode("")).toBeNull();
    expect(parseTypedAirportCode("12A")).toBeNull();
  });
});
