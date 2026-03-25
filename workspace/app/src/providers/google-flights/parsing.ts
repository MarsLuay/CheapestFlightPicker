import { createUnknownBookingSource } from "../../core/utils";
import type { BookingSource } from "../../shared/types";
import type { GoogleFlightLeg, GoogleFlightResult } from "./types";

function parseDateTime(dateParts: number[], timeParts: number[]): Date {
  return new Date(
    dateParts[0] ?? 0,
    (dateParts[1] ?? 1) - 1,
    dateParts[2] ?? 1,
    timeParts[0] ?? 0,
    timeParts[1] ?? 0
  );
}

const knownOtaPattern =
  /smart\s*fares|expedia|priceline|orbitz|travelocity|kiwi|gotogate|cheapoair|trip\.com|mytrip|edreams|budgetair|flightnetwork|fareboom|booking\.com/u;

function normalizeLabel(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/gu, "");
}

function parseBookingSource(
  route: unknown[],
  parsedLegs: GoogleFlightLeg[]
): BookingSource {
  const candidate = Array.isArray(route[24])
    ? route[24].find(
        (entry): entry is [string | undefined, string, string] =>
          Array.isArray(entry) &&
          typeof entry[1] === "string" &&
          typeof entry[2] === "string"
      )
    : null;

  if (!candidate) {
    return createUnknownBookingSource();
  }

  const sellerCode = typeof candidate[0] === "string" ? candidate[0] : undefined;
  const sellerName = candidate[1];
  const sellerUrl = candidate[2];
  const airlineCodes = new Set(parsedLegs.map((leg) => normalizeLabel(leg.airlineCode)));
  const airlineNames = new Set(parsedLegs.map((leg) => normalizeLabel(leg.airlineName)));
  const normalizedSellerName = normalizeLabel(sellerName);
  const normalizedSellerCode = sellerCode ? normalizeLabel(sellerCode) : "";
  const sellerMatchesAirline =
    airlineNames.has(normalizedSellerName) ||
    airlineCodes.has(normalizedSellerCode);

  if (sellerMatchesAirline) {
    return {
      type: "direct_airline",
      label: `Direct with ${sellerName}`,
      sellerName,
      url: sellerUrl,
      detected: true
    };
  }

  if (
    knownOtaPattern.test(sellerName) ||
    knownOtaPattern.test(sellerUrl.toLowerCase())
  ) {
    return {
      type: "ota",
      label: `OTA: ${sellerName}`,
      sellerName,
      url: sellerUrl,
      detected: true
    };
  }

  return {
    type: "ota",
    label: `OTA: ${sellerName}`,
    sellerName,
    url: sellerUrl,
    detected: true
  };
}

export function parseCalendarResponse(
  input: string
): Array<{ date: string; price: number }> {
  const parsed = JSON.parse(input.replace(/^\)\]\}'/u, ""))[0]?.[2];
  if (!parsed) {
    return [];
  }

  const decoded = JSON.parse(parsed);
  if (!Array.isArray(decoded) || decoded.length === 0) {
    return [];
  }

  const calendarEntries = decoded[decoded.length - 1];
  if (!Array.isArray(calendarEntries)) {
    return [];
  }

  return calendarEntries
    .map((entry) => {
      if (!Array.isArray(entry)) {
        return null;
      }

      const date = entry[0];
      const priceNode = entry[2]?.[0]?.[1];
      const price =
        typeof priceNode === "number"
          ? priceNode
          : typeof priceNode === "string"
            ? Number.parseFloat(priceNode)
            : Number.NaN;

      if (typeof date !== "string" || !Number.isFinite(price)) {
        return null;
      }

      return { date, price };
    })
    .filter((entry): entry is { date: string; price: number } => entry !== null)
    .sort((left, right) => left.date.localeCompare(right.date));
}

export function parseExactSearchResponse(input: string): GoogleFlightResult[] {
  const parsed = JSON.parse(input.replace(/^\)\]\}'/u, ""))[0]?.[2];
  if (!parsed) {
    return [];
  }

  const decoded = JSON.parse(parsed);
  const rawFlights: unknown[] = [];

  for (const index of [2, 3]) {
    const bucket = decoded?.[index];
    if (Array.isArray(bucket) && Array.isArray(bucket[0])) {
      rawFlights.push(...bucket[0]);
    }
  }

  return rawFlights
    .map((entry) => {
      if (!Array.isArray(entry)) {
        return null;
      }

      const route = entry[0];
      const pricing = entry[1];
      if (!Array.isArray(route) || !Array.isArray(pricing)) {
        return null;
      }

      const price = pricing[0]?.[pricing[0].length - 1];
      const legs = route[2];
      if (!Array.isArray(legs) || typeof price !== "number") {
        return null;
      }

      const parsedLegs = legs
        .map((leg) => {
          if (!Array.isArray(leg)) {
            return null;
          }

          const airlineCode = leg[22]?.[0];
          const airlineName = leg[22]?.[3];
          const flightNumber = leg[22]?.[1];
          const departureAirportCode = leg[3];
          const arrivalAirportCode = leg[6];
          const departureDateParts = leg[20];
          const arrivalDateParts = leg[21];
          const departureTimeParts = leg[8];
          const arrivalTimeParts = leg[10];
          const durationMinutes = leg[11];

          if (
            typeof airlineCode !== "string" ||
            typeof flightNumber !== "string" ||
            typeof departureAirportCode !== "string" ||
            typeof arrivalAirportCode !== "string" ||
            !Array.isArray(departureDateParts) ||
            !Array.isArray(arrivalDateParts) ||
            !Array.isArray(departureTimeParts) ||
            !Array.isArray(arrivalTimeParts) ||
            typeof durationMinutes !== "number"
          ) {
            return null;
          }

          return {
            airlineCode,
            airlineName:
              typeof airlineName === "string" ? airlineName : airlineCode,
            flightNumber,
            departureAirportCode,
            arrivalAirportCode,
            departureDateTime: parseDateTime(
              departureDateParts,
              departureTimeParts
            ),
            arrivalDateTime: parseDateTime(arrivalDateParts, arrivalTimeParts),
            durationMinutes
          };
        })
        .filter((leg): leg is NonNullable<typeof leg> => leg !== null);

      if (parsedLegs.length === 0) {
        return null;
      }

      const bookingSource = parseBookingSource(route, parsedLegs);

      return {
        bookingSource,
        price,
        durationMinutes: typeof route[9] === "number" ? route[9] : 0,
        stops: parsedLegs.length - 1,
        legs: parsedLegs
      };
    })
    .filter((flight): flight is GoogleFlightResult => flight !== null);
}
