import { describe, expect, it } from "vitest";

import {
  buildGoogleFlightsSearchLinks,
  buildGoogleFlightsSearchUrl,
  buildGoogleFlightsTfsParam
} from "./google-flights-link";
import type { FlightOption, SearchRequest } from "./types";

function buildRequest(overrides: Partial<SearchRequest> = {}): SearchRequest {
  return {
    tripType: "round_trip",
    origin: "SEA",
    destination: "PIT",
    departureDateFrom: "2026-05-12",
    departureDateTo: "2026-05-12",
    returnDateFrom: "2026-05-12",
    returnDateTo: "2026-05-12",
    minimumTripDays: 0,
    maximumTripDays: 14,
    departureTimeWindow: { from: 6, to: 24 },
    arrivalTimeWindow: { from: 6, to: 24 },
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
    maxResults: 10,
    ...overrides
  };
}

function buildOption(overrides: Partial<FlightOption> = {}): FlightOption {
  return {
    source: "google_round_trip",
    totalPrice: 240,
    currency: "USD",
    bookingSource: {
      type: "direct_airline",
      label: "Direct with United",
      sellerName: "United",
      detected: true
    },
    outboundDate: "2026-05-12",
    returnDate: "2026-05-12",
    slices: [
      {
        durationMinutes: 300,
        stops: 0,
        legs: [
          {
            airlineCode: "UA",
            airlineName: "United Airlines",
            flightNumber: "123",
            departureAirportCode: "SEA",
            departureAirportName: "Seattle-Tacoma International Airport",
            departureDateTime: "2026-05-12T08:00:00.000Z",
            arrivalAirportCode: "PIT",
            arrivalAirportName: "Pittsburgh International Airport",
            arrivalDateTime: "2026-05-12T13:00:00.000Z",
            durationMinutes: 300
          }
        ]
      },
      {
        durationMinutes: 310,
        stops: 0,
        legs: [
          {
            airlineCode: "UA",
            airlineName: "United Airlines",
            flightNumber: "456",
            departureAirportCode: "PIT",
            departureAirportName: "Pittsburgh International Airport",
            departureDateTime: "2026-05-12T18:00:00.000Z",
            arrivalAirportCode: "SEA",
            arrivalAirportName: "Seattle-Tacoma International Airport",
            arrivalDateTime: "2026-05-12T23:10:00.000Z",
            durationMinutes: 310
          }
        ]
      }
    ],
    ...overrides
  };
}

function buildNormalizedWindow(
  window: SearchRequest["departureTimeWindow"]
): { from: number; to: number } | undefined {
  if (!window) {
    return undefined;
  }

  const rawFrom = Math.max(0, Math.min(24, Math.round(window.from)));
  const rawTo = Math.max(0, Math.min(24, Math.round(window.to)));

  if (rawFrom === 0 && rawTo === 24) {
    return undefined;
  }

  const from = rawFrom === 24 ? 23 : rawFrom;
  const to = rawTo === 24 ? 23 : rawTo;

  return from <= to ? { from, to } : { from: to, to: from };
}

function buildExactHourWindow(
  dateTime: string,
  fallback: SearchRequest["departureTimeWindow"]
): { from: number; to: number } | undefined {
  const normalizedFallback = buildNormalizedWindow(fallback);
  const parsedDate = new Date(dateTime);
  const exactWindow = {
    from: parsedDate.getHours(),
    to: parsedDate.getHours()
  };

  if (!normalizedFallback) {
    return exactWindow;
  }

  if (
    exactWindow.from < normalizedFallback.from ||
    exactWindow.to > normalizedFallback.to
  ) {
    return normalizedFallback;
  }

  return exactWindow;
}

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/gu, "+").replace(/_/gu, "/");
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    "="
  );
  const buffer = Buffer.from(padded, "base64");
  return new Uint8Array(buffer);
}

function readVarint(bytes: Uint8Array, startIndex: number) {
  let index = startIndex;
  let shift = 0n;
  let value = 0n;

  while (index < bytes.length) {
    const current = BigInt(bytes[index] ?? 0);
    index += 1;
    value |= (current & 0x7fn) << shift;

    if ((current & 0x80n) === 0n) {
      return { nextIndex: index, value };
    }

    shift += 7n;
  }

  throw new Error("Unexpected end of varint");
}

function decodeMessage(bytes: Uint8Array): Array<{
  field: number;
  value: bigint | string | Uint8Array;
  wireType: number;
}> {
  const fields: Array<{
    field: number;
    value: bigint | string | Uint8Array;
    wireType: number;
  }> = [];
  let index = 0;

  while (index < bytes.length) {
    const tag = readVarint(bytes, index);
    index = tag.nextIndex;
    const field = Number(tag.value >> 3n);
    const wireType = Number(tag.value & 0x7n);

    if (wireType === 0) {
      const value = readVarint(bytes, index);
      index = value.nextIndex;
      fields.push({ field, value: value.value, wireType });
      continue;
    }

    if (wireType === 2) {
      const length = readVarint(bytes, index);
      index = length.nextIndex;
      const payload = bytes.slice(index, index + Number(length.value));
      index += Number(length.value);
      fields.push({ field, value: payload, wireType });
      continue;
    }

    throw new Error(`Unsupported wire type ${wireType}`);
  }

  return fields;
}

function decodeAirport(bytes: Uint8Array) {
  const fields = decodeMessage(bytes);
  const typeField = fields.find((field) => field.field === 1);
  const codeField = fields.find((field) => field.field === 2);

  return {
    code: codeField
      ? new TextDecoder().decode(codeField.value as Uint8Array)
      : "",
    type: Number(typeField?.value ?? 0n)
  };
}

function decodeSegment(bytes: Uint8Array) {
  const fields = decodeMessage(bytes);
  const dateField = fields.find((field) => field.field === 2);
  const fromField = fields.find((field) => field.field === 13);
  const toField = fields.find((field) => field.field === 14);
  const maxStopsField = fields.find((field) => field.field === 5);
  const airlineFields = fields.filter((field) => field.field === 6);
  const departureTimeFields = fields.filter(
    (field) => field.field === 8 || field.field === 9
  );
  const arrivalTimeFields = fields.filter(
    (field) => field.field === 10 || field.field === 11
  );

  return {
    airlines: airlineFields.map((field) =>
      new TextDecoder().decode(field.value as Uint8Array)
    ),
    arrivalTimeWindow:
      arrivalTimeFields.length === 2
        ? {
            from: Number(arrivalTimeFields[0]?.value ?? 0n),
            to: Number(arrivalTimeFields[1]?.value ?? 0n)
          }
        : undefined,
    date: dateField ? new TextDecoder().decode(dateField.value as Uint8Array) : "",
    departureTimeWindow:
      departureTimeFields.length === 2
        ? {
            from: Number(departureTimeFields[0]?.value ?? 0n),
            to: Number(departureTimeFields[1]?.value ?? 0n)
          }
        : undefined,
    fromAirport: fromField ? decodeAirport(fromField.value as Uint8Array) : null,
    maxStops: maxStopsField ? Number(maxStopsField.value) : undefined,
    toAirport: toField ? decodeAirport(toField.value as Uint8Array) : null
  };
}

describe("google flight link builder", () => {
  it("encodes a round-trip tfs payload with route, dates, cabin, passengers, and per-slice filters", () => {
    const request = buildRequest();
    const option = buildOption();

    const tfs = buildGoogleFlightsTfsParam(option, request);

    expect(tfs).toBeTruthy();

    const fields = decodeMessage(decodeBase64Url(tfs ?? ""));
    const segments = fields
      .filter((field) => field.field === 3)
      .map((field) => decodeSegment(field.value as Uint8Array));
    const passengers = fields
      .filter((field) => field.field === 8)
      .map((field) => Number(field.value));

    expect(Number(fields.find((field) => field.field === 1)?.value ?? 0n)).toBe(28);
    expect(Number(fields.find((field) => field.field === 2)?.value ?? 0n)).toBe(2);
    expect(Number(fields.find((field) => field.field === 9)?.value ?? 0n)).toBe(1);
    expect(Number(fields.find((field) => field.field === 19)?.value ?? 0n)).toBe(1);
    expect(passengers).toEqual([1]);
    expect(segments).toEqual([
      {
        airlines: ["UA"],
        arrivalTimeWindow: buildExactHourWindow(
          "2026-05-12T13:00:00.000Z",
          request.arrivalTimeWindow
        ),
        date: "2026-05-12",
        departureTimeWindow: buildExactHourWindow(
          "2026-05-12T08:00:00.000Z",
          request.departureTimeWindow
        ),
        fromAirport: { code: "SEA", type: 1 },
        maxStops: 0,
        toAirport: { code: "PIT", type: 1 }
      },
      {
        airlines: ["UA"],
        arrivalTimeWindow: buildExactHourWindow(
          "2026-05-12T23:10:00.000Z",
          request.arrivalTimeWindow
        ),
        date: "2026-05-12",
        departureTimeWindow: buildExactHourWindow(
          "2026-05-12T18:00:00.000Z",
          request.departureTimeWindow
        ),
        fromAirport: { code: "PIT", type: 1 },
        maxStops: 0,
        toAirport: { code: "SEA", type: 1 }
      }
    ]);
  });

  it("tightens round-trip links to the displayed itinerary hours when they fit inside the user's filters", () => {
    const request = buildRequest({
      departureTimeWindow: { from: 4, to: 23 },
      arrivalTimeWindow: { from: 4, to: 23 }
    });
    const option = buildOption({
      outboundDate: "2026-05-12",
      returnDate: "2026-05-19",
      slices: [
        {
          durationMinutes: 300,
          stops: 0,
          legs: [
            {
              airlineCode: "UA",
              airlineName: "United Airlines",
              flightNumber: "123",
              departureAirportCode: "SEA",
              departureAirportName: "Seattle-Tacoma International Airport",
              departureDateTime: "2026-05-12T05:00:00.000Z",
              arrivalAirportCode: "PIT",
              arrivalAirportName: "Pittsburgh International Airport",
              arrivalDateTime: "2026-05-12T10:00:00.000Z",
              durationMinutes: 300
            }
          ]
        },
        {
          durationMinutes: 310,
          stops: 0,
          legs: [
            {
              airlineCode: "UA",
              airlineName: "United Airlines",
              flightNumber: "456",
              departureAirportCode: "PIT",
              departureAirportName: "Pittsburgh International Airport",
              departureDateTime: "2026-05-19T23:00:00.000Z",
              arrivalAirportCode: "SEA",
              arrivalAirportName: "Seattle-Tacoma International Airport",
              arrivalDateTime: "2026-05-20T04:10:00.000Z",
              durationMinutes: 310
            }
          ]
        }
      ]
    });

    const tfs = buildGoogleFlightsTfsParam(option, request);
    const fields = decodeMessage(decodeBase64Url(tfs ?? ""));
    const segments = fields
      .filter((field) => field.field === 3)
      .map((field) => decodeSegment(field.value as Uint8Array));

    expect(segments).toEqual([
      expect.objectContaining({
        departureTimeWindow: buildExactHourWindow(
          "2026-05-12T05:00:00.000Z",
          request.departureTimeWindow
        ),
        arrivalTimeWindow: buildExactHourWindow(
          "2026-05-12T10:00:00.000Z",
          request.arrivalTimeWindow
        )
      }),
      expect.objectContaining({
        departureTimeWindow: buildExactHourWindow(
          "2026-05-19T23:00:00.000Z",
          request.departureTimeWindow
        ),
        arrivalTimeWindow: buildExactHourWindow(
          "2026-05-20T04:10:00.000Z",
          request.arrivalTimeWindow
        )
      })
    ]);
  });

  it("falls back to the user's requested windows when an exact round-trip hour would conflict", () => {
    const request = buildRequest({
      departureTimeWindow: { from: 9, to: 14 },
      arrivalTimeWindow: { from: 12, to: 20 }
    });
    const option = buildOption({
      outboundDate: "2026-05-12",
      returnDate: "2026-05-19",
      slices: [
        {
          durationMinutes: 300,
          stops: 0,
          legs: [
            {
              airlineCode: "UA",
              airlineName: "United Airlines",
              flightNumber: "123",
              departureAirportCode: "SEA",
              departureAirportName: "Seattle-Tacoma International Airport",
              departureDateTime: "2026-05-12T05:00:00.000Z",
              arrivalAirportCode: "PIT",
              arrivalAirportName: "Pittsburgh International Airport",
              arrivalDateTime: "2026-05-12T10:00:00.000Z",
              durationMinutes: 300
            }
          ]
        },
        {
          durationMinutes: 310,
          stops: 0,
          legs: [
            {
              airlineCode: "UA",
              airlineName: "United Airlines",
              flightNumber: "456",
              departureAirportCode: "PIT",
              departureAirportName: "Pittsburgh International Airport",
              departureDateTime: "2026-05-19T23:00:00.000Z",
              arrivalAirportCode: "SEA",
              arrivalAirportName: "Seattle-Tacoma International Airport",
              arrivalDateTime: "2026-05-20T04:10:00.000Z",
              durationMinutes: 310
            }
          ]
        }
      ]
    });

    const tfs = buildGoogleFlightsTfsParam(option, request);
    const fields = decodeMessage(decodeBase64Url(tfs ?? ""));
    const segments = fields
      .filter((field) => field.field === 3)
      .map((field) => decodeSegment(field.value as Uint8Array));

    expect(segments).toEqual([
      expect.objectContaining({
        departureTimeWindow: { from: 9, to: 14 },
        arrivalTimeWindow: { from: 12, to: 20 }
      }),
      expect.objectContaining({
        departureTimeWindow: { from: 9, to: 14 },
        arrivalTimeWindow: { from: 12, to: 20 }
      })
    ]);
  });

  it("builds a one-way search url with the expected Google Flights parameters", () => {
    const request = buildRequest({
      tripType: "one_way",
      returnDateFrom: undefined,
      returnDateTo: undefined,
      cabinClass: "business",
      passengers: {
        adults: 2,
        children: 1,
        infantsInSeat: 0,
        infantsOnLap: 1
      }
    });
    const option = buildOption({
      source: "google_one_way",
      returnDate: undefined,
      slices: [buildOption().slices[0] as FlightOption["slices"][number]]
    });

    const url = buildGoogleFlightsSearchUrl(option, request);

    expect(url).toBeTruthy();

    const parsedUrl = new URL(url ?? "");
    expect(parsedUrl.pathname).toBe("/travel/flights/search");
    expect(parsedUrl.searchParams.get("tfu")).toBe("EgoIABAAGAAgAigC");
    expect(parsedUrl.searchParams.get("hl")).toBe("en-US");
    expect(parsedUrl.searchParams.get("gl")).toBe("US");

    const fields = decodeMessage(
      decodeBase64Url(parsedUrl.searchParams.get("tfs") ?? "")
    );
    const passengers = fields
      .filter((field) => field.field === 8)
      .map((field) => Number(field.value));

    expect(Number(fields.find((field) => field.field === 9)?.value ?? 0n)).toBe(3);
    expect(Number(fields.find((field) => field.field === 19)?.value ?? 0n)).toBe(2);
    expect(passengers).toEqual([1, 1, 2, 4]);
  });

  it("builds separate outbound and return one-way links for two-ticket combos", () => {
    const request = buildRequest();
    const option = buildOption({
      source: "two_one_way_combo",
      outboundDate: "2026-05-12",
      returnDate: "2026-05-19"
    });

    const links = buildGoogleFlightsSearchLinks(option, request);

    expect(links.map((link) => link.label)).toEqual([
      "View outbound one-way",
      "View return one-way"
    ]);

    const outboundUrl = new URL(links[0]?.href ?? "");
    const returnUrl = new URL(links[1]?.href ?? "");
    const outboundFields = decodeMessage(
      decodeBase64Url(outboundUrl.searchParams.get("tfs") ?? "")
    );
    const returnFields = decodeMessage(
      decodeBase64Url(returnUrl.searchParams.get("tfs") ?? "")
    );
    const outboundSegments = outboundFields
      .filter((field) => field.field === 3)
      .map((field) => decodeSegment(field.value as Uint8Array));
    const returnSegments = returnFields
      .filter((field) => field.field === 3)
      .map((field) => decodeSegment(field.value as Uint8Array));

    expect(Number(outboundFields.find((field) => field.field === 19)?.value ?? 0n)).toBe(2);
    expect(Number(returnFields.find((field) => field.field === 19)?.value ?? 0n)).toBe(2);
    expect(outboundSegments).toHaveLength(1);
    expect(returnSegments).toHaveLength(1);
    expect(outboundSegments[0]?.date).toBe("2026-05-12");
    expect(outboundSegments[0]?.fromAirport).toEqual({ code: "SEA", type: 1 });
    expect(outboundSegments[0]?.toAirport).toEqual({ code: "PIT", type: 1 });
    expect(returnSegments[0]?.date).toBe("2026-05-19");
    expect(returnSegments[0]?.fromAirport).toEqual({ code: "PIT", type: 1 });
    expect(returnSegments[0]?.toAirport).toEqual({ code: "SEA", type: 1 });
  });
});
