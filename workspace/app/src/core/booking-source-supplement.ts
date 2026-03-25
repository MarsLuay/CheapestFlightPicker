import { findAirportByCode } from "./catalog";
import { mapWithConcurrency } from "./utils";
import type {
  FlightOption,
  SearchRequest,
  SearchSummary
} from "../shared/types";

const defaultSupplementTargetAirlineCodes = [
  "AC",
  "AF",
  "AZ",
  "IB",
  "KL",
  "LH",
  "LX",
  "OS",
  "SN",
  "TP",
  "UA"
] as const;

export type BookingSourceSupplementReason =
  | "airline_filter"
  | "targeted_airline"
  | "international_route"
  | "multi_airline_itinerary"
  | "nonstop_direct_booking_gap"
  | "direct_booking_preference_gap";

export interface BookingSourceSupplementProvider {
  supplementOption(
    option: FlightOption,
    request: SearchRequest
  ): Promise<FlightOption | null>;
}

export function needsBookingSourceSupplement(
  option: FlightOption | null
): option is FlightOption {
  return Boolean(
    option &&
      option.source !== "two_one_way_combo" &&
      !option.bookingSource.detected &&
      !option.bookingSource.sellerName &&
      option.slices.every((slice) => slice.legs.length > 0)
  );
}

function getConfiguredTargetAirlineCodes(): Set<string> {
  const configuredCodes =
    process.env.BOOKING_SOURCE_SUPPLEMENT_TARGET_AIRLINES?.split(",")
      .map((code) => code.trim().toUpperCase())
      .filter(Boolean) ?? [];

  if (configuredCodes.length > 0) {
    return new Set(configuredCodes);
  }

  return new Set(defaultSupplementTargetAirlineCodes);
}

function getOptionAirlineCodes(option: FlightOption): Set<string> {
  const codes = new Set<string>();

  for (const slice of option.slices) {
    for (const leg of slice.legs) {
      if (leg.airlineCode) {
        codes.add(leg.airlineCode.toUpperCase());
      }
    }
  }

  return codes;
}

function isInternationalRoute(request: SearchRequest): boolean {
  const originAirport = findAirportByCode(request.origin);
  const destinationAirport = findAirportByCode(request.destination);
  if (!originAirport || !destinationAirport) {
    return false;
  }

  return originAirport.country !== destinationAirport.country;
}

function hasTargetedAirline(option: FlightOption): boolean {
  const targetAirlineCodes = getConfiguredTargetAirlineCodes();
  for (const airlineCode of getOptionAirlineCodes(option)) {
    if (targetAirlineCodes.has(airlineCode)) {
      return true;
    }
  }

  return false;
}

function hasMultipleAirlines(option: FlightOption): boolean {
  return getOptionAirlineCodes(option).size > 1;
}

function isNonstopOption(option: FlightOption): boolean {
  return option.slices.length > 0 && option.slices.every((slice) => slice.stops === 0);
}

export function getBookingSourceSupplementReasons(
  option: FlightOption | null,
  request: SearchRequest
): BookingSourceSupplementReason[] {
  if (!needsBookingSourceSupplement(option)) {
    return [];
  }

  const reasons: BookingSourceSupplementReason[] = [];

  if (request.airlines.length > 0) {
    reasons.push("airline_filter");
  }

  if (hasTargetedAirline(option)) {
    reasons.push("targeted_airline");
  }

  if (isInternationalRoute(request)) {
    reasons.push("international_route");
  }

  if (hasMultipleAirlines(option)) {
    reasons.push("multi_airline_itinerary");
  }

  if (isNonstopOption(option)) {
    reasons.push("nonstop_direct_booking_gap");
  }

  if (request.preferDirectBookingOnly || request.stopsFilter === "nonstop") {
    reasons.push("direct_booking_preference_gap");
  }

  return reasons;
}

export function shouldAttemptBookingSourceSupplement(
  option: FlightOption | null,
  request: SearchRequest
): option is FlightOption {
  return getBookingSourceSupplementReasons(option, request).length > 0;
}

function getSupplementTargets(summary: SearchSummary): FlightOption[] {
  const uniqueOptions = new Set<FlightOption>();

  for (const option of [
    summary.cheapestOverall,
    summary.cheapestRoundTrip,
    summary.cheapestTwoOneWays,
    summary.cheapestDirectThere,
    summary.cheapestDirectReturn,
    summary.cheapestMultiStop
  ]) {
    if (shouldAttemptBookingSourceSupplement(option, summary.request)) {
      uniqueOptions.add(option);
    }
  }

  return [...uniqueOptions];
}

function getOptionSupplementTargets(
  options: FlightOption[],
  request: SearchRequest,
  maxTargets?: number
): FlightOption[] {
  const seen = new Set<FlightOption>();
  const targets = options
    .filter((option) => shouldAttemptBookingSourceSupplement(option, request))
    .sort((left, right) => {
      if (left.totalPrice !== right.totalPrice) {
        return left.totalPrice - right.totalPrice;
      }

      return (left.outboundDate ?? "").localeCompare(right.outboundDate ?? "");
    })
    .filter((option) => {
      if (seen.has(option)) {
        return false;
      }

      seen.add(option);
      return true;
    });

  if (!maxTargets || maxTargets >= targets.length) {
    return targets;
  }

  return targets.slice(0, maxTargets);
}

function replaceOption(
  option: FlightOption | null,
  replacements: Map<FlightOption, FlightOption>
): FlightOption | null {
  if (!option) {
    return null;
  }

  return replacements.get(option) ?? option;
}

export class BookingSourceSupplementService {
  constructor(
    private readonly providers: BookingSourceSupplementProvider[] = []
  ) {}

  async supplementOptions(
    options: FlightOption[],
    request: SearchRequest,
    maxTargets?: number
  ): Promise<FlightOption[]> {
    if (this.providers.length === 0 || options.length === 0) {
      return options;
    }

    const targets = getOptionSupplementTargets(options, request, maxTargets);
    if (targets.length === 0) {
      return options;
    }

    const replacements = new Map<FlightOption, FlightOption>();

    await mapWithConcurrency(targets, 2, async (target) => {
      let nextOption = target;

      for (const provider of this.providers) {
        if (!shouldAttemptBookingSourceSupplement(nextOption, request)) {
          break;
        }

        const supplemented = await provider.supplementOption(nextOption, request);
        if (supplemented) {
          nextOption = supplemented;
        }
      }

      replacements.set(target, nextOption);
      return nextOption;
    });

    return options.map((option) => replacements.get(option) ?? option);
  }

  async supplementSummary(summary: SearchSummary): Promise<SearchSummary> {
    if (this.providers.length === 0) {
      return summary;
    }

    const targets = getSupplementTargets(summary);
    if (targets.length === 0) {
      return summary;
    }

    const replacements = new Map<FlightOption, FlightOption>();

    const supplementedTargets = await this.supplementOptions(
      targets,
      summary.request
    );

    for (const [index, target] of targets.entries()) {
      replacements.set(target, supplementedTargets[index] ?? target);
    }

    return {
      ...summary,
      cheapestOverall: replaceOption(summary.cheapestOverall, replacements),
      cheapestRoundTrip: replaceOption(summary.cheapestRoundTrip, replacements),
      cheapestTwoOneWays: replaceOption(
        summary.cheapestTwoOneWays,
        replacements
      ),
      cheapestDirectThere: replaceOption(
        summary.cheapestDirectThere,
        replacements
      ),
      cheapestDirectReturn: replaceOption(
        summary.cheapestDirectReturn,
        replacements
      ),
      cheapestMultiStop: replaceOption(summary.cheapestMultiStop, replacements)
    };
  }
}
