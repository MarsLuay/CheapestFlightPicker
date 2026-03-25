import type { FlightOption, FlightSlice, SearchRequest, TimeWindow } from "./types";

export type GoogleFlightsSearchLink = {
  href: string;
  label: string;
};

type EncodedSegment = {
  airlines: string[];
  arrivalTimeWindow?: TimeWindow;
  date: string;
  departureTimeWindow?: TimeWindow;
  fromAirport: string;
  maxStops?: number;
  toAirport: string;
};

const googleFlightsSearchPath = "https://www.google.com/travel/flights/search";
const googleFlightsTfuParam = "EgoIABAAGAAgAigC";
const airportEncodingTypeIata = 1;
const roundTripValue = 1;
const oneWayValue = 2;
const defaultSearchFlags = Uint8Array.from([
  0x70,
  0x01,
  0x82,
  0x01,
  0x0b,
  0x08,
  0xff,
  0xff,
  0xff,
  0xff,
  0xff,
  0xff,
  0xff,
  0xff,
  0xff,
  0x01
]);

const base64UrlAlphabet =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function getSliceEndpoints(option: FlightOption) {
  const outboundSlice = option.slices[0];
  const returnSlice = option.slices[1];
  const outboundFirstLeg = outboundSlice?.legs[0];
  const outboundLastLeg = outboundSlice?.legs[outboundSlice.legs.length - 1];
  const returnFirstLeg = returnSlice?.legs[0];
  const returnLastLeg = returnSlice?.legs[returnSlice.legs.length - 1];

  return {
    outboundDestination: outboundLastLeg?.arrivalAirportCode,
    outboundOrigin: outboundFirstLeg?.departureAirportCode,
    returnDestination: returnLastLeg?.arrivalAirportCode,
    returnOrigin: returnFirstLeg?.departureAirportCode
  };
}

function buildSegmentFromSlice(
  slice: FlightSlice | undefined,
  date: string | undefined,
  fallbackFromAirport: string,
  fallbackToAirport: string,
  request: SearchRequest
): EncodedSegment | null {
  if (!date) {
    return null;
  }

  const firstLeg = slice?.legs[0];
  const lastLeg = slice?.legs[slice.legs.length - 1];
  const fromAirport = firstLeg?.departureAirportCode ?? fallbackFromAirport;
  const toAirport = lastLeg?.arrivalAirportCode ?? fallbackToAirport;
  const airlines = Array.from(
    new Set(
      slice?.legs
        .map((leg) => leg.airlineCode)
        .filter((airlineCode) => airlineCode.length > 0) ?? request.airlines
    )
  ).sort();
  const sliceDepartureTimeWindow = firstLeg
    ? buildExactHourWindow(firstLeg.departureDateTime)
    : undefined;
  const sliceArrivalTimeWindow = lastLeg
    ? buildExactHourWindow(lastLeg.arrivalDateTime)
    : undefined;

  return {
    airlines,
    arrivalTimeWindow:
      sliceArrivalTimeWindow ?? normalizeTimeWindow(request.arrivalTimeWindow),
    date,
    departureTimeWindow:
      sliceDepartureTimeWindow ??
      normalizeTimeWindow(request.departureTimeWindow),
    fromAirport,
    maxStops: resolveMaxStops(slice, request.stopsFilter),
    toAirport
  };
}

function buildSegments(
  option: FlightOption,
  request: SearchRequest
): EncodedSegment[] {
  const {
    outboundDestination,
    outboundOrigin,
    returnDestination,
    returnOrigin
  } = getSliceEndpoints(option);

  const outboundSegment = buildSegmentFromSlice(
    option.slices[0],
    option.outboundDate,
    outboundOrigin ?? request.origin,
    outboundDestination ?? request.destination,
    request
  );

  const returnSegment = option.returnDate
    ? buildSegmentFromSlice(
        option.slices[1],
        option.returnDate,
        returnOrigin ?? request.destination,
        returnDestination ?? request.origin,
        request
      )
    : null;

  return [outboundSegment, returnSegment].filter(
    (segment): segment is EncodedSegment => segment !== null
  );
}

function buildOneWayOptionFromSlice(
  option: FlightOption,
  sliceIndex: number
): FlightOption | null {
  const slice = option.slices[sliceIndex];
  const outboundDate = sliceIndex === 0 ? option.outboundDate : option.returnDate;

  if (!slice || !outboundDate) {
    return null;
  }

  return {
    source: "google_one_way",
    totalPrice: option.slicePrices?.[sliceIndex] ?? option.totalPrice,
    currency: option.currency,
    slices: [slice],
    slicePrices: [option.slicePrices?.[sliceIndex] ?? option.totalPrice],
    bookingSource: option.bookingSource,
    outboundDate
  };
}

function resolveMaxStops(
  slice: FlightSlice | undefined,
  stopsFilter: SearchRequest["stopsFilter"]
): number | undefined {
  const actualStops = slice?.stops;
  const requestedStops = mapStopsFilterToMaxStops(stopsFilter);

  if (actualStops === undefined) {
    return requestedStops;
  }

  if (requestedStops === undefined) {
    return actualStops;
  }

  return Math.min(actualStops, requestedStops);
}

function mapStopsFilterToMaxStops(
  stopsFilter: SearchRequest["stopsFilter"]
): number | undefined {
  switch (stopsFilter) {
    case "nonstop":
      return 0;
    case "max_1_stop":
      return 1;
    case "max_2_stops":
      return 2;
    default:
      return undefined;
  }
}

function normalizeTimeWindow(
  window: TimeWindow | null | undefined
): TimeWindow | undefined {
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

function buildExactHourWindow(dateTime: string): TimeWindow | undefined {
  const date = new Date(dateTime);
  const hour = date.getHours();

  if (!Number.isFinite(hour)) {
    return undefined;
  }

  return {
    from: hour,
    to: hour
  };
}

function encodeVarint(value: bigint | number): Uint8Array {
  let remaining = typeof value === "bigint" ? value : BigInt(value);
  const bytes: number[] = [];

  while (remaining >= 0x80n) {
    bytes.push(Number((remaining & 0x7fn) | 0x80n));
    remaining >>= 7n;
  }

  bytes.push(Number(remaining));
  return Uint8Array.from(bytes);
}

function encodeTag(fieldNumber: number, wireType: number): Uint8Array {
  return encodeVarint((fieldNumber << 3) | wireType);
}

function encodeInt(fieldNumber: number, value: bigint | number): Uint8Array {
  return concatBytes([encodeTag(fieldNumber, 0), encodeVarint(value)]);
}

function encodeString(fieldNumber: number, value: string): Uint8Array {
  const payload = new TextEncoder().encode(value);
  return encodeEmbedded(fieldNumber, payload);
}

function encodeEmbedded(
  fieldNumber: number,
  payload: Uint8Array
): Uint8Array {
  return concatBytes([
    encodeTag(fieldNumber, 2),
    encodeVarint(payload.length),
    payload
  ]);
}

function encodeAirport(airportCode: string): Uint8Array {
  return concatBytes([
    encodeInt(1, airportEncodingTypeIata),
    encodeString(2, airportCode)
  ]);
}

function encodeSegment(segment: EncodedSegment): Uint8Array {
  const fields: Uint8Array[] = [
    encodeString(2, segment.date),
    encodeEmbedded(13, encodeAirport(segment.fromAirport)),
    encodeEmbedded(14, encodeAirport(segment.toAirport))
  ];

  if (segment.maxStops !== undefined) {
    fields.push(encodeInt(5, segment.maxStops));
  }

  for (const airlineCode of segment.airlines) {
    fields.push(encodeString(6, airlineCode));
  }

  if (segment.departureTimeWindow) {
    fields.push(encodeInt(8, segment.departureTimeWindow.from));
    fields.push(encodeInt(9, segment.departureTimeWindow.to));
  }

  if (segment.arrivalTimeWindow) {
    fields.push(encodeInt(10, segment.arrivalTimeWindow.from));
    fields.push(encodeInt(11, segment.arrivalTimeWindow.to));
  }

  return concatBytes(fields);
}

function encodePassengers(passengers: SearchRequest["passengers"]): Uint8Array[] {
  const codes: number[] = [];

  for (let index = 0; index < passengers.adults; index += 1) {
    codes.push(1);
  }

  for (let index = 0; index < passengers.children; index += 1) {
    codes.push(2);
  }

  for (let index = 0; index < passengers.infantsInSeat; index += 1) {
    codes.push(3);
  }

  for (let index = 0; index < passengers.infantsOnLap; index += 1) {
    codes.push(4);
  }

  if (codes.length === 0) {
    codes.push(1);
  }

  return codes.map((code) => encodeInt(8, code));
}

function encodeCabinClass(cabinClass: SearchRequest["cabinClass"]): number {
  switch (cabinClass) {
    case "premium_economy":
      return 2;
    case "business":
      return 3;
    case "first":
      return 4;
    default:
      return 1;
  }
}

function encodeTripType(segments: EncodedSegment[]): number {
  return segments.length > 1 ? roundTripValue : oneWayValue;
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
  const combined = new Uint8Array(totalLength);
  let offset = 0;

  for (const part of parts) {
    combined.set(part, offset);
    offset += part.length;
  }

  return combined;
}

function encodeBase64Url(bytes: Uint8Array): string {
  let encoded = "";

  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] ?? 0;
    const second = bytes[index + 1] ?? 0;
    const third = bytes[index + 2] ?? 0;
    const chunk = (first << 16) | (second << 8) | third;

    encoded += base64UrlAlphabet[(chunk >> 18) & 0x3f] ?? "";
    encoded += base64UrlAlphabet[(chunk >> 12) & 0x3f] ?? "";

    if (index + 1 < bytes.length) {
      encoded += base64UrlAlphabet[(chunk >> 6) & 0x3f] ?? "";
    }

    if (index + 2 < bytes.length) {
      encoded += base64UrlAlphabet[chunk & 0x3f] ?? "";
    }
  }

  return encoded;
}

export function buildGoogleFlightsTfsParam(
  option: FlightOption,
  request: SearchRequest
): string | null {
  const segments = buildSegments(option, request);
  if (segments.length === 0) {
    return null;
  }

  // Google does not publish the `tfs` schema publicly. This follows the shape
  // of Google-generated links so result buttons land on real search results.
  const payload = concatBytes([
    encodeInt(1, 28),
    encodeInt(2, 2),
    ...segments.map((segment) => encodeEmbedded(3, encodeSegment(segment))),
    ...encodePassengers(request.passengers),
    encodeInt(9, encodeCabinClass(request.cabinClass)),
    defaultSearchFlags,
    encodeInt(19, encodeTripType(segments))
  ]);

  return encodeBase64Url(payload);
}

export function buildGoogleFlightsSearchUrl(
  option: FlightOption,
  request: SearchRequest
): string | null {
  const tfs = buildGoogleFlightsTfsParam(option, request);
  if (!tfs) {
    return null;
  }

  const searchParams = new URLSearchParams({
    gl: "US",
    hl: "en-US",
    tfs,
    tfu: googleFlightsTfuParam
  });

  return `${googleFlightsSearchPath}?${searchParams.toString()}`;
}

export function buildGoogleFlightsSearchLinks(
  option: FlightOption,
  request: SearchRequest
): GoogleFlightsSearchLink[] {
  if (option.source === "two_one_way_combo") {
    const outboundOption = buildOneWayOptionFromSlice(option, 0);
    const returnOption = buildOneWayOptionFromSlice(option, 1);
    const links: GoogleFlightsSearchLink[] = [];

    if (outboundOption) {
      const href = buildGoogleFlightsSearchUrl(outboundOption, request);
      if (href) {
        links.push({
          href,
          label: "View outbound one-way"
        });
      }
    }

    if (returnOption) {
      const href = buildGoogleFlightsSearchUrl(returnOption, request);
      if (href) {
        links.push({
          href,
          label: "View return one-way"
        });
      }
    }

    return links;
  }

  const href = buildGoogleFlightsSearchUrl(option, request);
  return href
    ? [
        {
          href,
          label: "View on Google Flights"
        }
      ]
    : [];
}
