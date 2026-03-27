import { isAxiosError } from "axios";

import { JsonFileCache } from "../../core/cache";
import { findAirlineByCode } from "../../core/catalog";
import type { BookingSourceSupplementProvider } from "../../core/booking-source-supplement";
import { appendServerLog } from "../../server/admin-log";
import type { FlightOption, SearchRequest } from "../../shared/types";
import {
  AmadeusClient,
  createAmadeusClientFromEnv
} from "./client";
import type {
  AmadeusFlightOffer,
  AmadeusFlightOfferSearchParams,
  AmadeusFlightOfferSegment
} from "./types";

const negativeCacheTtlMs = 1000 * 60 * 15;
const defaultCircuitBreakerFailureThreshold = 2;
const defaultCircuitBreakerCooldownMs = 1000 * 60 * 10;

type MissingInfoNegativeCacheEntry = {
  status: "miss";
};

type MissingInfoNegativeCache = Pick<
  JsonFileCache<MissingInfoNegativeCacheEntry>,
  "get" | "set"
>;

type CircuitBreakerFailureKind = "rate_limited" | "timeout";

type SupplementLogger = (
  level: "info" | "error",
  message: string,
  details?: Record<string, unknown>
) => void;

type AmadeusSupplementCircuitBreakerOptions = {
  cooldownMs?: number;
  failureThreshold?: number;
};

type AmadeusMissingInfoSupplementProviderOptions = {
  circuitBreaker?: AmadeusSupplementCircuitBreakerOptions;
  logger?: SupplementLogger;
  now?: () => number;
};

function mapCabinClass(
  cabinClass: SearchRequest["cabinClass"]
): AmadeusFlightOfferSearchParams["travelClass"] {
  switch (cabinClass) {
    case "premium_economy":
      return "PREMIUM_ECONOMY";
    case "business":
      return "BUSINESS";
    case "first":
      return "FIRST";
    default:
      return "ECONOMY";
  }
}

function getIncludedAirlineCodes(option: FlightOption): string | undefined {
  const codes = new Set<string>();

  for (const slice of option.slices) {
    for (const leg of slice.legs) {
      if (leg.airlineCode) {
        codes.add(leg.airlineCode);
      }
    }
  }

  return codes.size > 0 ? [...codes].join(",") : undefined;
}

function buildSearchParams(
  option: FlightOption,
  request: SearchRequest
): AmadeusFlightOfferSearchParams | null {
  if (option.source === "two_one_way_combo" || !option.outboundDate) {
    return null;
  }

  const adults = request.passengers.adults;
  const children = request.passengers.children;
  const infants =
    request.passengers.infantsInSeat + request.passengers.infantsOnLap;

  if (adults < 1 || infants > adults) {
    return null;
  }

  return {
    originLocationCode: request.origin,
    destinationLocationCode: request.destination,
    departureDate: option.outboundDate,
    returnDate: option.returnDate,
    adults,
    children: children > 0 ? children : undefined,
    infants: infants > 0 ? infants : undefined,
    currencyCode: option.currency,
    max: 8,
    nonStop: option.slices.every((slice) => slice.stops === 0),
    travelClass: mapCabinClass(request.cabinClass),
    includedAirlineCodes: getIncludedAirlineCodes(option)
  };
}

function getSegmentCarrierCode(
  segment: AmadeusFlightOfferSegment
): string | undefined {
  return segment.operating?.carrierCode ?? segment.carrierCode;
}

function segmentMatches(
  leg: FlightOption["slices"][number]["legs"][number],
  segment: AmadeusFlightOfferSegment
): boolean {
  return (
    segment.departure?.iataCode === leg.departureAirportCode &&
    segment.arrival?.iataCode === leg.arrivalAirportCode &&
    getSegmentCarrierCode(segment) === leg.airlineCode &&
    segment.number === leg.flightNumber
  );
}

export function matchAmadeusOffer(
  option: FlightOption,
  offers: AmadeusFlightOffer[]
): AmadeusFlightOffer | null {
  for (const offer of offers) {
    const itineraries = offer.itineraries;
    if (!Array.isArray(itineraries) || itineraries.length !== option.slices.length) {
      continue;
    }

    const matches = itineraries.every((itinerary, itineraryIndex) => {
      const segments = itinerary.segments;
      const slice = option.slices[itineraryIndex];

      if (!slice || !Array.isArray(segments) || segments.length !== slice.legs.length) {
        return false;
      }

      return segments.every((segment, segmentIndex) => {
        const leg = slice.legs[segmentIndex];
        return Boolean(leg && segmentMatches(leg, segment));
      });
    });

    if (matches) {
      return offer;
    }
  }

  return null;
}

function supplementUnknownBookingSource(
  option: FlightOption,
  offer: AmadeusFlightOffer
): FlightOption | null {
  const validatingAirlineCodes = Array.isArray(offer.validatingAirlineCodes)
    ? offer.validatingAirlineCodes.filter(
        (code): code is string => typeof code === "string" && Boolean(code)
      )
    : [];

  if (validatingAirlineCodes.length !== 1) {
    return null;
  }

  const airlineCode = validatingAirlineCodes[0];
  const airline = findAirlineByCode(airlineCode);
  const sellerName = airline?.name ?? airlineCode;

  return {
    ...option,
    bookingSource: {
      ...option.bookingSource,
      sellerName
    }
  };
}

function buildNegativeCacheKey(
  option: FlightOption,
  request: SearchRequest,
  params: AmadeusFlightOfferSearchParams
): unknown {
  return {
    version: 1,
    provider: "amadeus_missing_info",
    request: {
      tripType: request.tripType,
      origin: request.origin,
      destination: request.destination,
      departureDateFrom: request.departureDateFrom,
      departureDateTo: request.departureDateTo,
      returnDateFrom: request.returnDateFrom,
      returnDateTo: request.returnDateTo,
      cabinClass: request.cabinClass,
      passengers: request.passengers
    },
    params,
    itinerary: option.slices.map((slice) => ({
      stops: slice.stops,
      legs: slice.legs.map((leg) => ({
        airlineCode: leg.airlineCode,
        flightNumber: leg.flightNumber,
        departureAirportCode: leg.departureAirportCode,
        departureDateTime: leg.departureDateTime,
        arrivalAirportCode: leg.arrivalAirportCode,
        arrivalDateTime: leg.arrivalDateTime
      }))
    }))
  };
}

function parsePositiveIntegerEnv(
  value: string | undefined,
  fallback: number
): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function classifyCircuitBreakerError(
  error: unknown
): {
  code?: string;
  kind: CircuitBreakerFailureKind;
  message: string;
  statusCode?: number;
} | null {
  if (!isAxiosError(error)) {
    return null;
  }

  const statusCode =
    typeof error.response?.status === "number"
      ? error.response.status
      : undefined;
  const code = typeof error.code === "string" ? error.code : undefined;

  if (statusCode === 429) {
    return {
      kind: "rate_limited",
      message: error.message,
      statusCode,
      code
    };
  }

  const timedOut =
    code === "ECONNABORTED" ||
    code === "ETIMEDOUT" ||
    statusCode === 408 ||
    statusCode === 504 ||
    /timeout/iu.test(error.message);

  if (!timedOut) {
    return null;
  }

  return {
    kind: "timeout",
    message: error.message,
    statusCode,
    code
  };
}

export class AmadeusMissingInfoSupplementProvider
  implements BookingSourceSupplementProvider
{
  private readonly negativeCache: MissingInfoNegativeCache;

  private readonly logger?: SupplementLogger;

  private readonly now: () => number;

  private readonly circuitBreakerCooldownMs: number;

  private readonly circuitBreakerFailureThreshold: number;

  private consecutiveBreakerFailures = 0;

  private circuitOpenUntil = 0;

  constructor(
    private readonly client: Pick<AmadeusClient, "searchFlightOffers">,
    negativeCache?: MissingInfoNegativeCache,
    options?: AmadeusMissingInfoSupplementProviderOptions
  ) {
    this.negativeCache =
      negativeCache ??
      new JsonFileCache<MissingInfoNegativeCacheEntry>({
        directorySegments: [".cache", "amadeus", "missing-info-misses"],
        ttlMs: negativeCacheTtlMs,
        maxEntries: 500,
        sweepIntervalMs: 1000 * 60 * 2,
        version: 1
      });
    this.logger = options?.logger;
    this.now = options?.now ?? Date.now;
    this.circuitBreakerCooldownMs =
      options?.circuitBreaker?.cooldownMs ??
      defaultCircuitBreakerCooldownMs;
    this.circuitBreakerFailureThreshold =
      options?.circuitBreaker?.failureThreshold ??
      defaultCircuitBreakerFailureThreshold;
  }

  async supplementOption(
    option: FlightOption,
    request: SearchRequest
  ): Promise<FlightOption | null> {
    const params = buildSearchParams(option, request);
    if (!params) {
      return null;
    }

    if (this.now() < this.circuitOpenUntil) {
      return null;
    }

    const negativeCacheKey = buildNegativeCacheKey(option, request, params);
    if (this.negativeCache.get(negativeCacheKey)) {
      return null;
    }

    try {
      const offers = await this.client.searchFlightOffers(params);
      this.consecutiveBreakerFailures = 0;
      const matchingOffer = matchAmadeusOffer(option, offers);
      if (!matchingOffer) {
        this.negativeCache.set(negativeCacheKey, { status: "miss" });
        return null;
      }

      const supplemented = supplementUnknownBookingSource(option, matchingOffer);
      if (!supplemented) {
        this.negativeCache.set(negativeCacheKey, { status: "miss" });
        return null;
      }

      return supplemented;
    } catch (error) {
      this.recordCircuitBreakerFailure(option, request, error);
      return null;
    }
  }

  private recordCircuitBreakerFailure(
    option: FlightOption,
    request: SearchRequest,
    error: unknown
  ): void {
    const circuitBreakerError = classifyCircuitBreakerError(error);
    if (!circuitBreakerError) {
      return;
    }

    this.consecutiveBreakerFailures += 1;

    const baseDetails = {
      provider: "amadeus_missing_info",
      failureKind: circuitBreakerError.kind,
      failureCount: this.consecutiveBreakerFailures,
      failureThreshold: this.circuitBreakerFailureThreshold,
      route: `${request.origin} -> ${request.destination}`,
      outboundDate: option.outboundDate ?? null,
      returnDate: option.returnDate ?? null,
      statusCode: circuitBreakerError.statusCode ?? null,
      code: circuitBreakerError.code ?? null,
      error: circuitBreakerError.message
    };

    this.logger?.(
      "error",
      `Amadeus missing-info supplement ${circuitBreakerError.kind.replace("_", " ")} failure`,
      baseDetails
    );

    if (this.consecutiveBreakerFailures < this.circuitBreakerFailureThreshold) {
      return;
    }

    this.circuitOpenUntil = this.now() + this.circuitBreakerCooldownMs;
    this.consecutiveBreakerFailures = 0;

    this.logger?.("error", "Amadeus missing-info supplement circuit opened", {
      ...baseDetails,
      cooldownMs: this.circuitBreakerCooldownMs,
      retryAfter: new Date(this.circuitOpenUntil).toISOString()
    });
  }
}

export function createAmadeusMissingInfoSupplementProviderFromEnv():
  | AmadeusMissingInfoSupplementProvider
  | null {
  const client = createAmadeusClientFromEnv();
  return client
    ? new AmadeusMissingInfoSupplementProvider(client, undefined, {
        circuitBreaker: {
          cooldownMs: parsePositiveIntegerEnv(
            process.env.AMADEUS_SUPPLEMENT_CIRCUIT_BREAKER_COOLDOWN_MS,
            defaultCircuitBreakerCooldownMs
          ),
          failureThreshold: parsePositiveIntegerEnv(
            process.env.AMADEUS_SUPPLEMENT_CIRCUIT_BREAKER_THRESHOLD,
            defaultCircuitBreakerFailureThreshold
          )
        },
        logger(level, message, details) {
          appendServerLog(level, message, details, {
            persist: true,
            source: "server"
          });
        }
      })
    : null;
}
