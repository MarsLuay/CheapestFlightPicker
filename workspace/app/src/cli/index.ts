#!/usr/bin/env node
import { Command } from "commander";

import { FlightSearchService } from "../core/search";
import { summarizeSlice } from "../core/utils";
import type {
  FlightOption,
  HackerFareInsight,
  PriceAlert,
  SearchRequest,
  SearchSummary,
  TimingGuidance
} from "../shared/types";

const program = new Command();
const searchService = new FlightSearchService();

export type Logger = (message: string) => void;

export function parseAirlines(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim().toUpperCase())
    .filter(Boolean);
}

export function printOption(
  label: string,
  option: FlightOption | null,
  log: Logger = console.log
): void {
  if (!option) {
    log(`${label}: none`);
    return;
  }

  log(`${label}: ${option.currency} ${option.totalPrice}`);
  log(`  Booking source: ${option.bookingSource.label}`);
  for (const slice of option.slices) {
    log(`  - ${summarizeSlice(slice)}`);
  }
}

export function printTimingGuidance(
  guidance: TimingGuidance | null,
  log: Logger = console.log
): void {
  if (!guidance) {
    return;
  }

  log(
    `Timing guidance: ${
      guidance.recommendation === "book_now" ? "Book now" : "Wait"
    } (${guidance.confidence} confidence)`
  );
  log(`  ${guidance.summary}`);
  for (const reason of guidance.reasons) {
    log(`  - ${reason}`);
  }
}

export function printPriceAlert(
  alert: PriceAlert | null,
  log: Logger = console.log
): void {
  if (!alert) {
    return;
  }

  log(`Price alert: ${alert.headline}`);
  log(`  ${alert.summary}`);
}

export function printHackerFareInsight(
  insight: HackerFareInsight | null,
  log: Logger = console.log
): void {
  if (!insight) {
    return;
  }

  log(`Separate one-ways: ${insight.summary}`);
}

export function printHeader(
  request: SearchRequest,
  log: Logger = console.log
): void {
  log("");
  log("Cheapest Flight Picker");
  log("======================");
  log(`Route: ${request.origin} -> ${request.destination}`);
  log(`Trip type: ${request.tripType}`);
  if (request.tripType === "round_trip") {
    log(
      `Trip length: ${request.minimumTripDays ?? 0} to ${request.maximumTripDays ?? 14} days`
    );
  }
  log("");
}

export function printSearchResultSummary(
  summary: SearchSummary,
  request: SearchRequest,
  log: Logger = console.log
): void {
  printHeader(request, log);

  printOption("Cheapest overall", summary.cheapestOverall, log);
  printOption("Cheapest round-trip", summary.cheapestRoundTrip, log);
  printOption("Cheapest two one-ways", summary.cheapestTwoOneWays, log);
  printOption("Cheapest nonstop", summary.cheapestNonstop, log);
  printOption("Cheapest option with stops", summary.cheapestMultiStop, log);
  printPriceAlert(summary.priceAlert, log);
  printHackerFareInsight(summary.hackerFareInsight, log);
  printTimingGuidance(summary.timingGuidance, log);

  log("");
  log(`Evaluated date pairs: ${summary.evaluatedDatePairs.length}`);
  log(`Inspected options: ${summary.inspectedOptions}`);
}

program
  .name("cheapest-flight-picker")
  .description(
    "Find the cheapest one-way or round-trip flights within date and time windows."
  )
  .requiredOption("--trip-type <tripType>", "one_way or round_trip")
  .requiredOption("--origin <origin>", "IATA origin airport code")
  .requiredOption("--destination <destination>", "IATA destination airport code")
  .requiredOption("--depart-from <date>", "Departure window start YYYY-MM-DD")
  .requiredOption("--depart-to <date>", "Departure window end YYYY-MM-DD")
  .option("--return-from <date>", "Return window start YYYY-MM-DD")
  .option("--return-to <date>", "Return window end YYYY-MM-DD")
  .option(
    "--min-trip-days <days>",
    "Minimum number of days between departure and return",
    "0"
  )
  .option(
    "--max-trip-days <days>",
    "Maximum number of days between departure and return",
    "14"
  )
  .option(
    "--cabin <cabin>",
    "economy, premium_economy, business, first",
    "economy"
  )
  .option("--stops <stops>", "any, nonstop, max_1_stop, max_2_stops", "any")
  .option(
    "--prefer-direct-booking-only",
    "Filter out OTA fares when Google exposes the seller",
    false
  )
  .option(
    "--no-require-free-carry-on-bag",
    "Allow flights with no free carry-on bag"
  )
  .option("--airlines <codes>", "Comma-separated airline codes", "")
  .option(
    "--max-results <count>",
    "How many top date candidates to inspect",
    "12"
  )
  .action(async (options) => {
    const request: SearchRequest = {
      tripType: options.tripType,
      origin: options.origin,
      destination: options.destination,
      departureDateFrom: options.departFrom,
      departureDateTo: options.departTo,
      returnDateFrom: options.returnFrom,
      returnDateTo: options.returnTo,
      minimumTripDays: Number.parseInt(options.minTripDays, 10),
      maximumTripDays: Number.parseInt(options.maxTripDays, 10),
      cabinClass: options.cabin,
      stopsFilter: options.stops,
      preferDirectBookingOnly: Boolean(options.preferDirectBookingOnly),
      requireFreeCarryOnBag: options.requireFreeCarryOnBag,
      airlines: parseAirlines(options.airlines),
      passengers: {
        adults: 1,
        children: 0,
        infantsInSeat: 0,
        infantsOnLap: 0
      },
      maxResults: Number.parseInt(options.maxResults, 10)
    };

    try {
      const summary = await searchService.search(request);
      printSearchResultSummary(summary, request);
    } catch (error) {
      console.error(error instanceof Error ? error.message : "Search failed");
      process.exitCode = 1;
    }
  });

if (process.env.NODE_ENV !== "test") {
  void program.parseAsync(process.argv);
}
