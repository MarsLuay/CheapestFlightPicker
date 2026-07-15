import { z } from "zod";

import {
  cabinClassValues,
  stopsFilterValues,
  tripTypeValues
} from "./types";

const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/u;
const dayMs = 24 * 60 * 60 * 1000;
const maxSearchPassengers = 9;

const upperCode = (message: string) =>
  z
    .string()
    .trim()
    .min(3, message)
    .max(3, message)
    .regex(/^[A-Za-z]{3}$/u, message)
    .transform((value) => value.toUpperCase());

const timeWindowSchema = z
  .object({
    from: z.number().int().min(0).max(24),
    to: z.number().int().min(0).max(24)
  })
  .transform((value) => {
    if (value.from <= value.to) {
      return value;
    }

    return {
      from: value.to,
      to: value.from
    };
  });

function parseIsoCalendarDateToUtcTimestamp(value: string): number | null {
  const match = value.match(isoDateRegex);
  if (!match) {
    return null;
  }

  const [yearPart, monthPart, dayPart] = value.split("-");
  const year = Number.parseInt(yearPart ?? "", 10);
  const month = Number.parseInt(monthPart ?? "", 10);
  const day = Number.parseInt(dayPart ?? "", 10);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    return null;
  }

  const timestamp = Date.UTC(year, month - 1, day);
  const parsedDate = new Date(timestamp);

  if (
    parsedDate.getUTCFullYear() !== year ||
    parsedDate.getUTCMonth() !== month - 1 ||
    parsedDate.getUTCDate() !== day
  ) {
    return null;
  }

  return timestamp;
}

const isoCalendarDate = (label: string) =>
  z
    .string()
    .regex(isoDateRegex, `${label} must use YYYY-MM-DD`)
    .refine(
      (value) => parseIsoCalendarDateToUtcTimestamp(value) !== null,
      `${label} must be a real calendar date`
    );

export const searchRequestSchema = z
  .object({
    tripType: z.enum(tripTypeValues),
    useExactDates: z.boolean().default(false),
    origin: upperCode("Origin airport code must be 3 letters"),
    destination: upperCode("Destination airport code must be 3 letters"),
    departureDateFrom: isoCalendarDate("Departure date"),
    departureDateTo: isoCalendarDate("Departure date"),
    returnDateFrom: isoCalendarDate("Return date").optional(),
    returnDateTo: isoCalendarDate("Return date").optional(),
    minimumTripDays: z.number().int().min(0).max(180).default(0),
    maximumTripDays: z.number().int().min(0).max(180).default(14),
    departureTimeWindow: timeWindowSchema.nullish(),
    arrivalTimeWindow: timeWindowSchema.nullish(),
    cabinClass: z.enum(cabinClassValues),
    stopsFilter: z.enum(stopsFilterValues),
    preferDirectBookingOnly: z.boolean().default(false),
    requireFreeCarryOnBag: z.boolean().default(true),
    airlines: z
      .array(
        z
          .string()
          .trim()
          .min(2)
          .max(3)
          .regex(/^[0-9A-Za-z]{2,3}$/u, "Airline codes must be alphanumeric")
          .transform((value) => value.toUpperCase())
      )
      .default([]),
    passengers: z
      .object({
        adults: z.number().int().min(1).max(9).default(1),
        children: z.number().int().min(0).max(9).default(0),
        infantsInSeat: z.number().int().min(0).max(9).default(0),
        infantsOnLap: z.number().int().min(0).max(9).default(0)
      })
      .default({
        adults: 1,
        children: 0,
        infantsInSeat: 0,
        infantsOnLap: 0
      }),
    maxResults: z.number().int().min(1).max(20).default(5)
  })
  .superRefine((value, ctx) => {
    if (value.origin === value.destination) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Origin and destination must be different",
        path: ["destination"]
      });
    }

    if (value.passengers.infantsOnLap > value.passengers.adults) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Lap infants cannot exceed the number of adults",
        path: ["passengers", "infantsOnLap"]
      });
    }

    const totalPassengers =
      value.passengers.adults +
      value.passengers.children +
      value.passengers.infantsInSeat +
      value.passengers.infantsOnLap;
    if (totalPassengers > maxSearchPassengers) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Google Flights supports at most 9 total passengers per search, including infants",
        path: ["passengers"]
      });
    }

    const departureFrom = parseIsoCalendarDateToUtcTimestamp(
      value.departureDateFrom
    );
    const departureTo = parseIsoCalendarDateToUtcTimestamp(value.departureDateTo);
    if (departureFrom === null || departureTo === null) {
      return;
    }

    if (departureFrom > departureTo) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Departure start date must be on or before departure end date",
        path: ["departureDateTo"]
      });
    }

    if (value.tripType === "round_trip") {
      if (!value.returnDateFrom || !value.returnDateTo) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Round-trip searches require both return dates",
          path: ["returnDateFrom"]
        });
        return;
      }

      const returnFrom = parseIsoCalendarDateToUtcTimestamp(value.returnDateFrom);
      const returnTo = parseIsoCalendarDateToUtcTimestamp(value.returnDateTo);
      if (returnFrom === null || returnTo === null) {
        return;
      }

      if (returnFrom > returnTo) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Return start date must be on or before return end date",
          path: ["returnDateTo"]
        });
      }

      if (returnTo < departureFrom) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Return window must not end before the departure window starts",
          path: ["returnDateTo"]
        });
      }

      if (value.useExactDates) {
        const departureSpanDays = Math.round(
          (departureTo - departureFrom) / dayMs
        );
        const returnSpanDays = Math.round(
          (returnTo - returnFrom) / dayMs
        );

        if (departureSpanDays !== returnSpanDays) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message:
              "Exact-date searches require departure and return windows to span the same number of days",
            path: ["returnDateTo"]
          });
        }

        const exactTripLengthDays = Math.round(
          (returnFrom - departureFrom) / dayMs
        );
        if (exactTripLengthDays < 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message:
              "Exact-date searches require each matched return date to be on or after its departure date",
            path: ["returnDateFrom"]
          });
        }

        return;
      }

      const minimumTripDays = value.minimumTripDays ?? 0;
      const maximumTripDays = value.maximumTripDays ?? 14;
      if (maximumTripDays < minimumTripDays) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Maximum trip length must be on or after the minimum trip length",
          path: ["maximumTripDays"]
        });
        return;
      }

      const possibleReturnFrom = Math.max(
        returnFrom,
        departureFrom + minimumTripDays * dayMs
      );
      const possibleReturnTo = Math.min(
        returnTo,
        departureTo + maximumTripDays * dayMs
      );

      if (possibleReturnFrom > possibleReturnTo) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `No round-trip dates fit a trip length between ${minimumTripDays} and ${maximumTripDays} day${
            maximumTripDays === 1 ? "" : "s"
          } within the selected windows`,
          path: ["maximumTripDays"]
        });
      }
    }
  });
