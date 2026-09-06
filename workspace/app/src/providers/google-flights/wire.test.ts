import { describe, expect, it } from "vitest";

import {
  getGoogleFlightsWireErrorCode,
  isTransientGoogleFlightsWireErrorCode
} from "./wire";

describe("Google Flights wire envelope detection", () => {
  it("detects the HTTP-200 ErrorResponse envelope with gRPC status 13", () => {
    const body =
      `)]}'\n\n[["wrb.fr",null,null,null,null,[13]],["di",35],["af.httprm",34,"x",15]]`;

    expect(getGoogleFlightsWireErrorCode(body)).toBe(13);
    expect(isTransientGoogleFlightsWireErrorCode(13)).toBe(true);
  });

  it("returns null for a normal wrb.fr payload", () => {
    const inner = JSON.stringify([[["2026-10-08", null, [[null, 120]]]]]);
    const body = `)]}'\n[["wrb.fr",null,${JSON.stringify(inner)}]]`;

    expect(getGoogleFlightsWireErrorCode(body)).toBeNull();
  });

  it("returns -1 when wrb.fr has a null payload without a numeric code", () => {
    const body = `)]}'\n[["wrb.fr",null,null]]`;
    expect(getGoogleFlightsWireErrorCode(body)).toBe(-1);
  });
});
