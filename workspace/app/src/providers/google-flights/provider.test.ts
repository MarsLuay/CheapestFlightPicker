import { describe, expect, it } from "vitest";

import { GoogleFlightsProvider } from "./provider";
import type { FlightOption } from "../../shared/types";

function buildOption(
  bookingSource: FlightOption["bookingSource"]
): FlightOption {
  return {
    source: "google_one_way",
    totalPrice: 100,
    currency: "USD",
    slices: [
      {
        durationMinutes: 120,
        stops: 0,
        legs: []
      }
    ],
    bookingSource
  };
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
});
