import { z } from "zod";

import {
  cabinClassValues,
  stopsFilterValues,
  tripTypeValues
} from "./types";

const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/u;

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

export const searchRequestSchema = z
  .object({
    tripType: z.enum(tripTypeValues),
    origin: upperCode("Origin airport code must be 3 letters"),
    destination: upperCode("Destination airport code must be 3 letters"),
    departureDateFrom: z
      .string()
      .regex(isoDateRegex, "Departure date must use YYYY-MM-DD"),
    departureDateTo: z
      .string()
      .regex(isoDateRegex, "Departure date must use YYYY-MM-DD"),
    returnDateFrom: z
      .string()
      .regex(isoDateRegex, "Return date must use YYYY-MM-DD")
      .optional(),
    returnDateTo: z
      .string()
      .regex(isoDateRegex, "Return date must use YYYY-MM-DD")
      .optional(),
    minimumTripDays: z.number().int().min(0).max(180).default(0),
    maximumTripDays: z.number().int().min(0).max(180).default(14),
    departureTimeWindow: timeWindowSchema.nullish(),
    arrivalTimeWindow: timeWindowSchema.nullish(),
    cabinClass: z.enum(cabinClassValues),
    stopsFilter: z.enum(stopsFilterValues),
    preferDirectBookingOnly: z.boolean().default(false),
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

    const departureFrom = new Date(value.departureDateFrom);
    const departureTo = new Date(value.departureDateTo);
    if (departureFrom.getTime() > departureTo.getTime()) {
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

      const returnFrom = new Date(value.returnDateFrom);
      const returnTo = new Date(value.returnDateTo);
      if (returnFrom.getTime() > returnTo.getTime()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Return start date must be on or before return end date",
          path: ["returnDateTo"]
        });
      }

      if (returnTo.getTime() < departureFrom.getTime()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Return window must not end before the departure window starts",
          path: ["returnDateTo"]
        });
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
        returnFrom.getTime(),
        departureFrom.getTime() + minimumTripDays * 24 * 60 * 60 * 1000
      );
      const possibleReturnTo = Math.min(
        returnTo.getTime(),
        departureTo.getTime() + maximumTripDays * 24 * 60 * 60 * 1000
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

export type SearchRequestInput = z.input<typeof searchRequestSchema>;
