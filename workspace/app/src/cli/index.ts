#!/usr/bin/env node
import { Command } from "commander";

import { FlightSearchService } from "../core/search";
import { summarizeSlice } from "../core/utils";
import type {
  FlightOption,
  HackerFareInsight,
  PriceAlert,
  SearchRequest,
  TimingGuidance
} from "../shared/types";

const program = new Command();
const searchService = new FlightSearchService();

function parseAirlines(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim().toUpperCase())
    .filter(Boolean);
}

function printOption(label: string, option: FlightOption | null) {
  if (!option) {
    console.log(`${label}: none`);
    return;
  }

  console.log(`${label}: ${option.currency} ${option.totalPrice}`);
  console.log(`  Booking source: ${option.bookingSource.label}`);
  for (const slice of option.slices) {
    console.log(`  - ${summarizeSlice(slice)}`);
  }
}

function printTimingGuidance(guidance: TimingGuidance | null) {
  if (!guidance) {
    return;
  }

  console.log(
    `Timing guidance: ${
      guidance.recommendation === "book_now" ? "Book now" : "Wait"
    } (${guidance.confidence} confidence)`
  );
  console.log(`  ${guidance.summary}`);
  for (const reason of guidance.reasons) {
    console.log(`  - ${reason}`);
  }
}

function printPriceAlert(alert: PriceAlert | null) {
  if (!alert) {
    return;
  }

  console.log(`Price alert: ${alert.headline}`);
  console.log(`  ${alert.summary}`);
}

function printHackerFareInsight(insight: HackerFareInsight | null) {
  if (!insight) {
    return;
  }

  console.log(`Separate one-ways: ${insight.summary}`);
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
  .option("--airlines <codes>", "Comma-separated airline codes", "")
  .option(
    "--max-results <count>",
    "How many top date candidates to inspect",
    "5"
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

      console.log("");
      console.log("Cheapest Flight Picker");
      console.log("======================");
      console.log(`Route: ${request.origin} -> ${request.destination}`);
      console.log(`Trip type: ${request.tripType}`);
      if (request.tripType === "round_trip") {
        console.log(
          `Trip length: ${request.minimumTripDays ?? 0} to ${request.maximumTripDays ?? 14} days`
        );
      }
      console.log("");

      printOption("Cheapest overall", summary.cheapestOverall);
      printOption("Cheapest round-trip", summary.cheapestRoundTrip);
      printOption("Cheapest two one-ways", summary.cheapestTwoOneWays);
      printOption("Cheapest direct there", summary.cheapestDirectThere);
      if (request.tripType === "round_trip") {
        printOption("Cheapest direct return", summary.cheapestDirectReturn);
      }
      printOption("Cheapest option with stops", summary.cheapestMultiStop);
      printPriceAlert(summary.priceAlert);
      printHackerFareInsight(summary.hackerFareInsight);
      printTimingGuidance(summary.timingGuidance);

      console.log("");
      console.log(`Evaluated date pairs: ${summary.evaluatedDatePairs.length}`);
      console.log(`Inspected options: ${summary.inspectedOptions}`);
    } catch (error) {
      console.error(error instanceof Error ? error.message : "Search failed");
      process.exitCode = 1;
    }
  });

void program.parseAsync(process.argv);
