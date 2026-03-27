import { JsonFileCache } from "./cache";
import { findAirportByCode } from "./catalog";
import {
  getOptionAirlineCodes,
  isNonstopOption,
  optionAppearsToIncludeFreeCarryOnBag
} from "./fare-characteristics";
import { createAmadeusClientFromEnv, type AmadeusClient } from "../providers/amadeus/client";
import type { AmadeusItineraryPriceMetricsEntry } from "../providers/amadeus/types";
import type {
  HackerFareInsight,
  FlightOption,
  PriceAlert,
  SearchRequest,
  SearchSummary,
  TimingConfidence,
  TimingGuidance,
  TimingPricePosition,
  TimingRecommendation,
  TimingTrend
} from "../shared/types";

type TimingObservedFare = {
  airlineCodes: string[];
  bookingSourceType: FlightOption["bookingSource"]["type"];
  durationMinutes: number;
  includesFreeCarryOnBag: boolean;
  nonstop: boolean;
  price: number;
  source: FlightOption["source"];
  stopsCount: number;
};

type TimingObservation = {
  observedAt: string;
  bestPrice: number;
  currency: string;
  daysUntilDeparture: number;
  topFares: TimingObservedFare[];
  airlineMix: string[];
  cheapestNonstopPrice: number | null;
  allTopFaresIncludeFreeCarryOnBag: boolean;
  directAirlineCount: number;
  otaCount: number;
  mixedOrUnknownCount: number;
  optionCount: number;
  volatility: number | null;
};

type TimingMarketPriceMetrics = {
  currency: string;
  firstQuartile: number;
  maximum: number;
  median: number;
  minimum: number;
  source: "amadeus" | "local_emulation";
  thirdQuartile: number;
};

type TimingFuturePriceProjection = {
  forecastPrice: number;
  horizonDays: number;
  optimisticPrice: number;
  pessimisticPrice: number;
  riskAmount: number;
  sampleSize: number;
  savingsAmount: number;
};

type TimingSignal = {
  priority: number;
  reason: string;
  score: number;
};

type TimingMarketPriceCacheEntry =
  | {
      metrics: TimingMarketPriceMetrics;
      status: "hit";
    }
  | {
      status: "miss";
    };

type TimingGuidanceServiceOptions = {
  amadeusClient?: Pick<AmadeusClient, "getItineraryPriceMetrics"> | null;
  historyCache?: Pick<JsonFileCache<TimingObservation[]>, "get" | "set">;
  marketPriceCache?: Pick<
    JsonFileCache<TimingMarketPriceCacheEntry>,
    "get" | "set"
  >;
  routeHistoryCache?: Pick<JsonFileCache<TimingObservation[]>, "get" | "set">;
};

const dayMs = 24 * 60 * 60 * 1000;
const maxHistoryEntries = 60;
const maxRouteHistoryEntries = 180;

function formatPrice(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0
  }).format(amount);
}

function startOfToday(now: Date): number {
  return new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  ).getTime();
}

function differenceInWholeDays(startAt: number, endAt: number): number {
  return Math.floor((endAt - startAt) / dayMs);
}

export function buildWatchKey(request: SearchRequest): Record<string, unknown> {
  return {
    airlines: request.airlines,
    arrivalTimeWindow: request.arrivalTimeWindow ?? null,
    cabinClass: request.cabinClass,
    departureDateFrom: request.departureDateFrom,
    departureDateTo: request.departureDateTo,
    departureTimeWindow: request.departureTimeWindow ?? null,
    destination: request.destination,
    maxResults: request.maxResults,
    maximumTripDays: request.maximumTripDays ?? 14,
    minimumTripDays: request.minimumTripDays ?? 0,
    origin: request.origin,
    passengers: request.passengers,
    preferDirectBookingOnly: request.preferDirectBookingOnly,
    requireFreeCarryOnBag: request.requireFreeCarryOnBag ?? true,
    returnDateFrom: request.returnDateFrom ?? null,
    returnDateTo: request.returnDateTo ?? null,
    stopsFilter: request.stopsFilter,
    tripType: request.tripType
  };
}

function getMonthBucket(date: string | undefined): string | null {
  if (!date || date.length < 7) {
    return null;
  }

  return date.slice(0, 7);
}

function buildMarketWatchKey(request: SearchRequest): Record<string, unknown> {
  return {
    airlines: request.airlines,
    arrivalTimeWindow: request.arrivalTimeWindow ?? null,
    cabinClass: request.cabinClass,
    departureMonth: getMonthBucket(request.departureDateFrom),
    departureTimeWindow: request.departureTimeWindow ?? null,
    destination: request.destination,
    maximumTripDays: request.maximumTripDays ?? 14,
    minimumTripDays: request.minimumTripDays ?? 0,
    origin: request.origin,
    passengers: request.passengers,
    preferDirectBookingOnly: request.preferDirectBookingOnly,
    requireFreeCarryOnBag: request.requireFreeCarryOnBag ?? true,
    returnMonth: getMonthBucket(request.returnDateFrom),
    stopsFilter: request.stopsFilter,
    tripType: request.tripType
  };
}

function calculateDaysUntilDeparture(
  request: SearchRequest,
  now = new Date()
): number {
  const todayStart = startOfToday(now);
  const departureStart = new Date(`${request.departureDateFrom}T00:00:00`).getTime();

  return Math.max(0, differenceInWholeDays(todayStart, departureStart));
}

function getRouteKind(request: SearchRequest): "domestic" | "international" {
  const originAirport = findAirportByCode(request.origin);
  const destinationAirport = findAirportByCode(request.destination);

  if (
    originAirport &&
    destinationAirport &&
    originAirport.country === destinationAirport.country
  ) {
    return "domestic";
  }

  return "international";
}

function percentile(values: number[], percent: number): number {
  if (values.length === 0) {
    return 0;
  }

  const index = Math.max(
    0,
    Math.min(values.length - 1, Math.floor((values.length - 1) * percent))
  );

  return values[index] ?? values[0] ?? 0;
}

function average(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function getProjectionHorizonDays(daysUntilDeparture: number): number {
  if (daysUntilDeparture >= 120) {
    return 14;
  }

  if (daysUntilDeparture >= 60) {
    return 10;
  }

  if (daysUntilDeparture >= 30) {
    return 7;
  }

  if (daysUntilDeparture >= 14) {
    return 4;
  }

  if (daysUntilDeparture >= 7) {
    return 2;
  }

  return 1;
}

function getOptionTotalDurationMinutes(option: FlightOption): number {
  return option.slices.reduce(
    (total, slice) => total + Math.max(0, slice.durationMinutes),
    0
  );
}

function getOptionTotalStops(option: FlightOption): number {
  return option.slices.reduce((total, slice) => total + Math.max(0, slice.stops), 0);
}

function getTrend(observations: TimingObservation[]): TimingTrend {
  if (observations.length < 3) {
    return "unknown";
  }

  const recentObservations = observations.slice(-5);
  const firstPrice = recentObservations[0]?.bestPrice ?? 0;
  const lastPrice = recentObservations[recentObservations.length - 1]?.bestPrice ?? 0;

  if (firstPrice <= 0) {
    return "unknown";
  }

  const changeRatio = (lastPrice - firstPrice) / firstPrice;

  if (changeRatio >= 0.04) {
    return "rising";
  }

  if (changeRatio <= -0.04) {
    return "falling";
  }

  return "flat";
}

function getPricePosition(
  currentBestPrice: number,
  observedLowPrice: number,
  observedMedianPrice: number,
  historySampleSize: number
): TimingPricePosition {
  if (historySampleSize < 2 || observedLowPrice <= 0) {
    return "unknown";
  }

  if (currentBestPrice <= observedLowPrice * 1.03) {
    return "near_low";
  }

  if (
    currentBestPrice >= observedMedianPrice * 1.08 &&
    currentBestPrice >= observedLowPrice * 1.12
  ) {
    return "high";
  }

  return "typical";
}

function formatRouteWindowReason(
  routeKind: "domestic" | "international",
  daysUntilDeparture: number
): { score: number; reason: string } | null {
  if (routeKind === "domestic") {
    if (daysUntilDeparture <= 21) {
      return {
        score: 3,
        reason:
          "You are within three weeks of departure, which usually makes last-minute drops less likely."
      };
    }

    if (daysUntilDeparture >= 90) {
      return {
        score: -2,
        reason:
          "You are still far from departure, so there is usually more room for prices to move."
      };
    }

    if (daysUntilDeparture <= 35) {
      return {
        score: 1,
        reason:
          "You are moving into the tighter part of the typical domestic booking window."
      };
    }

    return null;
  }

  if (daysUntilDeparture <= 45) {
    return {
      score: 3,
      reason:
        "You are fairly close to departure, so waiting for a later drop is riskier."
    };
  }

  if (daysUntilDeparture >= 180) {
    return {
      score: -2,
      reason:
        "You are still far from departure, so waiting is usually safer than rushing."
    };
  }

  if (daysUntilDeparture <= 75) {
    return {
      score: 1,
      reason:
        "You are entering the tighter part of the booking window for a longer-haul trip."
    };
  }

  return null;
}

function summarizeRecommendation(
  recommendation: TimingRecommendation,
  pricePosition: TimingPricePosition,
  trend: TimingTrend,
  daysUntilDeparture: number,
  projection?: TimingFuturePriceProjection | null
): string {
  if (
    projection &&
    recommendation === "book_now" &&
    projection.riskAmount >= Math.max(projection.savingsAmount * 1.2, 15)
  ) {
    return "The modeled short-term risk of waiting is larger than the remaining likely savings.";
  }

  if (
    projection &&
    recommendation === "wait" &&
    projection.savingsAmount >= Math.max(projection.riskAmount * 1.2, 15) &&
    daysUntilDeparture > 14
  ) {
    return "The modeled short-term downside still looks larger than the likely rebound risk.";
  }

  if (recommendation === "book_now") {
    if (pricePosition === "near_low" && trend === "rising") {
      return "This fare is near the low end of your watch history and recent checks have been climbing.";
    }

    if (pricePosition === "near_low") {
      return "This fare is already close to the best level this app has seen for this exact trip.";
    }

    if (trend === "rising") {
      return "Recent checks are trending upward, so waiting is more likely to cost you than save you.";
    }

    return `Departure is getting close in ${daysUntilDeparture} day${
      daysUntilDeparture === 1 ? "" : "s"
    }, which makes a cheaper late drop less likely.`;
  }

  if (pricePosition === "high" && trend === "falling") {
    return "This fare is still above your recent range and the latest checks have been easing lower.";
  }

  if (trend === "falling") {
    return "Recent checks are drifting down, so there is a decent case for waiting a bit longer.";
  }

  if (pricePosition === "high") {
    return "This fare is still running above the recent range for this exact trip.";
  }

  return "You still have enough runway before departure that waiting is the safer bet right now.";
}

function determineConfidence(
  historySampleSize: number,
  absoluteScore: number,
  routeSignalApplied: boolean,
  trend: TimingTrend,
  pricePosition: TimingPricePosition,
  hasMarketPriceMetrics: boolean,
  hasVolatilitySignal: boolean,
  hasProjectionSignal: boolean,
  hasAirlineBaselineSignal: boolean
): TimingConfidence {
  let confidenceScore = 0;

  if (historySampleSize >= 8) {
    confidenceScore += 2;
  } else if (historySampleSize >= 4) {
    confidenceScore += 1;
  }

  if (absoluteScore >= 4) {
    confidenceScore += 2;
  } else if (absoluteScore >= 2) {
    confidenceScore += 1;
  }

  if (trend !== "unknown") {
    confidenceScore += 1;
  }

  if (pricePosition !== "unknown") {
    confidenceScore += 1;
  }

  if (routeSignalApplied) {
    confidenceScore += 1;
  }

  if (hasMarketPriceMetrics) {
    confidenceScore += 1;
  }

  if (hasVolatilitySignal) {
    confidenceScore += 1;
  }

  if (hasProjectionSignal) {
    confidenceScore += 1;
  }

  if (hasAirlineBaselineSignal) {
    confidenceScore += 1;
  }

  if (confidenceScore >= 6) {
    return "high";
  }

  if (confidenceScore >= 3) {
    return "medium";
  }

  return "low";
}

function calculateSnapshotVolatility(options: FlightOption[]): number | null {
  const prices = options
    .map((option) => option.totalPrice)
    .filter((price) => Number.isFinite(price))
    .sort((left, right) => left - right)
    .slice(0, 3);

  if (prices.length < 2) {
    return null;
  }

  const low = prices[0] ?? 0;
  const high = prices[prices.length - 1] ?? 0;
  if (low <= 0) {
    return null;
  }

  return (high - low) / low;
}

function buildObservation(
  summary: SearchSummary,
  options: FlightOption[],
  now = new Date()
): TimingObservation | null {
  const currentBestPrice = summary.cheapestOverall?.totalPrice ?? Number.NaN;
  const currency = summary.cheapestOverall?.currency;

  if (!Number.isFinite(currentBestPrice) || !currency) {
    return null;
  }

  const sortedOptions = [...options].sort(
    (left, right) => left.totalPrice - right.totalPrice
  );
  const topFares = sortedOptions.slice(0, 3).map((option) => ({
    airlineCodes: getOptionAirlineCodes(option),
    bookingSourceType: option.bookingSource.type,
    durationMinutes: getOptionTotalDurationMinutes(option),
    includesFreeCarryOnBag: optionAppearsToIncludeFreeCarryOnBag(
      option,
      summary.request.cabinClass
    ),
    nonstop: isNonstopOption(option),
    price: option.totalPrice,
    source: option.source,
    stopsCount: getOptionTotalStops(option)
  }));
  const airlineMix = new Set<string>();

  for (const fare of topFares) {
    for (const airlineCode of fare.airlineCodes) {
      airlineMix.add(airlineCode);
    }
  }

  let directAirlineCount = 0;
  let otaCount = 0;
  let mixedOrUnknownCount = 0;

  for (const option of options) {
    if (option.bookingSource.type === "direct_airline") {
      directAirlineCount += 1;
      continue;
    }

    if (option.bookingSource.type === "ota") {
      otaCount += 1;
      continue;
    }

    mixedOrUnknownCount += 1;
  }

  return {
    observedAt: now.toISOString(),
    bestPrice: currentBestPrice,
    currency,
    daysUntilDeparture: calculateDaysUntilDeparture(summary.request, now),
    topFares,
    airlineMix: [...airlineMix].sort(),
    cheapestNonstopPrice: summary.cheapestNonstop?.totalPrice ?? null,
    allTopFaresIncludeFreeCarryOnBag:
      topFares.length > 0 && topFares.every((fare) => fare.includesFreeCarryOnBag),
    directAirlineCount,
    otaCount,
    mixedOrUnknownCount,
    optionCount: options.length,
    volatility: calculateSnapshotVolatility(sortedOptions)
  };
}

function buildFuturePriceProjection(
  observations: TimingObservation[],
  currentBestPrice: number,
  daysUntilDeparture: number,
  marketPriceMetrics: TimingMarketPriceMetrics | null
): TimingFuturePriceProjection | null {
  const recentObservations = observations.slice(-8);
  if (recentObservations.length < 3) {
    return null;
  }

  const uniqueLeadTimes = new Set(
    recentObservations.map((observation) => observation.daysUntilDeparture)
  );
  if (uniqueLeadTimes.size < 2) {
    return null;
  }

  const weights = recentObservations.map((_, index) => (index + 1) ** 2);
  const totalWeight = weights.reduce((total, value) => total + value, 0);
  if (totalWeight <= 0) {
    return null;
  }

  const meanX =
    recentObservations.reduce(
      (total, observation, index) =>
        total + observation.daysUntilDeparture * (weights[index] ?? 0),
      0
    ) / totalWeight;
  const meanY =
    recentObservations.reduce(
      (total, observation, index) =>
        total + observation.bestPrice * (weights[index] ?? 0),
      0
    ) / totalWeight;

  const denominator = recentObservations.reduce((total, observation, index) => {
    const weight = weights[index] ?? 0;
    const centeredX = observation.daysUntilDeparture - meanX;
    return total + weight * centeredX * centeredX;
  }, 0);
  if (denominator <= 0) {
    return null;
  }

  const numerator = recentObservations.reduce((total, observation, index) => {
    const weight = weights[index] ?? 0;
    return (
      total +
      weight *
        (observation.daysUntilDeparture - meanX) *
        (observation.bestPrice - meanY)
    );
  }, 0);
  const slope = numerator / denominator;
  const intercept = meanY - slope * meanX;
  const horizonDays = getProjectionHorizonDays(daysUntilDeparture);
  const targetLeadTime = Math.max(0, daysUntilDeparture - horizonDays);

  const recentPrices = recentObservations.map((observation) => observation.bestPrice);
  const observedLow = Math.min(...recentPrices, currentBestPrice);
  const observedHigh = Math.max(...recentPrices, currentBestPrice);
  const lowerBound =
    Math.min(observedLow, marketPriceMetrics?.minimum ?? observedLow) * 0.95;
  const upperBound =
    Math.max(observedHigh, marketPriceMetrics?.maximum ?? observedHigh) * 1.1;

  const rawForecastPrice = intercept + slope * targetLeadTime;
  const forecastPrice = clamp(rawForecastPrice, lowerBound, upperBound);
  const residualVariance =
    recentObservations.reduce((total, observation, index) => {
      const predictedValue = intercept + slope * observation.daysUntilDeparture;
      const residual = observation.bestPrice - predictedValue;
      return total + (weights[index] ?? 0) * residual * residual;
    }, 0) / totalWeight;
  const residualSpread = Math.sqrt(Math.max(0, residualVariance));
  const optimisticPrice = clamp(
    forecastPrice - residualSpread,
    lowerBound,
    upperBound
  );
  const pessimisticPrice = clamp(
    forecastPrice + residualSpread,
    lowerBound,
    upperBound
  );

  return {
    forecastPrice,
    horizonDays,
    optimisticPrice,
    pessimisticPrice,
    riskAmount: Math.max(0, pessimisticPrice - currentBestPrice),
    sampleSize: recentObservations.length,
    savingsAmount: Math.max(0, currentBestPrice - optimisticPrice)
  };
}

function sharesAirlineCode(left: string[], right: string[]): boolean {
  if (left.length === 0 || right.length === 0) {
    return false;
  }

  const rightSet = new Set(right);
  return left.some((code) => rightSet.has(code));
}

// Inspired by the reference project: average price per airline is a strong
// feature, so we compare today's cheapest fare against a local airline baseline
// from similar searches on the same route/month bucket.
function buildAirlineBaselineSignal(
  currentObservation: TimingObservation | undefined,
  comparisonObservations: TimingObservation[],
  currency: string
): TimingSignal | null {
  const currentBestFare = currentObservation?.topFares[0];
  if (!currentBestFare || currentBestFare.airlineCodes.length === 0) {
    return null;
  }

  const comparablePrices = comparisonObservations
    .flatMap((observation) => observation.topFares)
    .filter(
      (fare) =>
        fare.airlineCodes.length > 0 &&
        sharesAirlineCode(fare.airlineCodes, currentBestFare.airlineCodes) &&
        fare.stopsCount === currentBestFare.stopsCount &&
        fare.nonstop === currentBestFare.nonstop &&
        fare.durationMinutes >= currentBestFare.durationMinutes * 0.75 &&
        fare.durationMinutes <= currentBestFare.durationMinutes * 1.25
    )
    .map((fare) => fare.price);

  const baselinePrice = average(comparablePrices);
  if (!baselinePrice || comparablePrices.length < 3) {
    return null;
  }

  if (currentBestFare.price <= baselinePrice * 0.92) {
    return {
      priority: 2,
      reason: `Similar ${currentBestFare.nonstop ? "nonstop" : `${currentBestFare.stopsCount}-stop`} fares on this airline pattern usually land around ${formatPrice(
        Math.round(baselinePrice),
        currency
      )}, so today's ${formatPrice(currentBestFare.price, currency)} fare is running below that baseline.`,
      score: 1
    };
  }

  if (currentBestFare.price >= baselinePrice * 1.08) {
    return {
      priority: 2,
      reason: `Similar ${currentBestFare.nonstop ? "nonstop" : `${currentBestFare.stopsCount}-stop`} fares on this airline pattern usually land around ${formatPrice(
        Math.round(baselinePrice),
        currency
      )}, so today's fare is running above that baseline.`,
      score: -1
    };
  }

  return null;
}

function buildLocalMarketPriceMetrics(
  observations: TimingObservation[],
  currency: string
): TimingMarketPriceMetrics | null {
  const prices = observations
    .map((observation) => observation.bestPrice)
    .filter((price) => Number.isFinite(price))
    .sort((left, right) => left - right);

  if (prices.length < 4) {
    return null;
  }

  return {
    currency,
    firstQuartile: percentile(prices, 0.25),
    maximum: prices[prices.length - 1] ?? 0,
    median: percentile(prices, 0.5),
    minimum: prices[0] ?? 0,
    source: "local_emulation",
    thirdQuartile: percentile(prices, 0.75)
  };
}

function buildAmadeusMarketPriceMetrics(
  entries: AmadeusItineraryPriceMetricsEntry[],
  currency: string
): TimingMarketPriceMetrics | null {
  const entry = entries[0];
  const priceMetrics = Array.isArray(entry?.priceMetrics) ? entry.priceMetrics : [];
  if (priceMetrics.length === 0) {
    return null;
  }

  let minimum: number | null = null;
  let firstQuartile: number | null = null;
  let median: number | null = null;
  let thirdQuartile: number | null = null;
  let maximum: number | null = null;

  for (const metric of priceMetrics) {
    const amount =
      typeof metric.amount === "number"
        ? metric.amount
        : typeof metric.amount === "string"
          ? Number.parseFloat(metric.amount)
          : Number.NaN;
    if (!Number.isFinite(amount)) {
      continue;
    }

    switch (metric.quartileRanking) {
      case "MINIMUM":
        minimum = amount;
        break;
      case "FIRST":
        firstQuartile = amount;
        break;
      case "MEDIUM":
        median = amount;
        break;
      case "THIRD":
        thirdQuartile = amount;
        break;
      case "MAXIMUM":
        maximum = amount;
        break;
      default:
        break;
    }
  }

  if (
    minimum === null ||
    firstQuartile === null ||
    median === null ||
    thirdQuartile === null ||
    maximum === null
  ) {
    return null;
  }

  return {
    currency,
    firstQuartile,
    maximum,
    median,
    minimum,
    source: "amadeus",
    thirdQuartile
  };
}

type MarketPricePosition = "high" | "low" | "typical" | "unknown";

function getMarketPricePosition(
  currentBestPrice: number,
  metrics: TimingMarketPriceMetrics | null
): MarketPricePosition {
  if (!metrics) {
    return "unknown";
  }

  if (currentBestPrice <= metrics.firstQuartile * 1.02) {
    return "low";
  }

  if (currentBestPrice >= metrics.thirdQuartile * 0.98) {
    return "high";
  }

  return "typical";
}

function buildMarketPriceReason(
  currentBestPrice: number,
  metrics: TimingMarketPriceMetrics | null
): { reason: string; score: number } | null {
  if (!metrics) {
    return null;
  }

  const marketPosition = getMarketPricePosition(currentBestPrice, metrics);
  const marketLabel =
    metrics.source === "amadeus"
      ? "Amadeus route-level price analysis"
      : "Your local fare-history price analysis";

  if (marketPosition === "low") {
    return {
      score: 1,
      reason: `${marketLabel} puts this fare near the lower end of the current market range.`
    };
  }

  if (marketPosition === "high") {
    return {
      score: -1,
      reason: `${marketLabel} puts this fare near the upper end of the current market range.`
    };
  }

  return null;
}

export function buildPriceAlert(
  currentBestPrice: number,
  currency: string,
  observations: TimingObservation[]
): PriceAlert | null {
  if (observations.length < 2) {
    return null;
  }

  const previousObservation = observations[observations.length - 2];
  if (!previousObservation || previousObservation.bestPrice <= 0) {
    return null;
  }

  const previousBestPrice = previousObservation.bestPrice;
  const changeAmount = Math.abs(currentBestPrice - previousBestPrice);
  const rawChangePercent =
    ((currentBestPrice - previousBestPrice) / previousBestPrice) * 100;
  const changePercent = Math.round(Math.abs(rawChangePercent));
  const lowestHistoricalPrice = observations
    .slice(0, -1)
    .reduce(
      (lowest, observation) => Math.min(lowest, observation.bestPrice),
      previousBestPrice
    );

  if (currentBestPrice < lowestHistoricalPrice) {
    return {
      kind: "new_low",
      headline: "New lowest tracked price",
      summary: `This trip just hit a new low in your local watch history, beating the previous best by ${formatPrice(
        changeAmount,
        currency
      )}.`,
      changeAmount,
      changePercent,
      previousBestPrice,
      currentBestPrice,
      currency
    };
  }

  if (rawChangePercent <= -10) {
    return {
      kind: "significant_drop",
      headline: "Price dropped sharply",
      summary: `The best fare is down about ${changePercent}% since the last time you checked this trip.`,
      changeAmount,
      changePercent,
      previousBestPrice,
      currentBestPrice,
      currency
    };
  }

  if (rawChangePercent >= 10) {
    return {
      kind: "significant_rise",
      headline: "Price jumped since your last check",
      summary: `The best fare is up about ${changePercent}% since the last time you checked this trip.`,
      changeAmount,
      changePercent,
      previousBestPrice,
      currentBestPrice,
      currency
    };
  }

  return null;
}

export function buildHackerFareInsight(
  summary: SearchSummary
): HackerFareInsight | null {
  const hackerFare = summary.cheapestTwoOneWays;
  const traditionalRoundTrip = summary.cheapestRoundTrip;

  if (
    !hackerFare ||
    !traditionalRoundTrip ||
    hackerFare.currency !== traditionalRoundTrip.currency
  ) {
    return null;
  }

  if (hackerFare.totalPrice >= traditionalRoundTrip.totalPrice) {
    return null;
  }

  const savingsAmount = traditionalRoundTrip.totalPrice - hackerFare.totalPrice;
  const savingsPercent = Math.round(
    (savingsAmount / traditionalRoundTrip.totalPrice) * 100
  );

  return {
    savingsAmount,
    savingsPercent,
    hackerFarePrice: hackerFare.totalPrice,
    traditionalRoundTripPrice: traditionalRoundTrip.totalPrice,
    currency: hackerFare.currency,
    headline: "Separate one-ways",
    summary:
      "For this route, booking separate one-way flights is currently coming in lower than a standard round-trip."
  };
}

export function buildTimingGuidance(
  summary: SearchSummary,
  observations: TimingObservation[],
  now = new Date(),
  marketPriceMetrics?: TimingMarketPriceMetrics | null,
  marketObservations: TimingObservation[] = observations
): TimingGuidance | null {
  const currentBestPrice = summary.cheapestOverall?.totalPrice ?? Number.NaN;
  const currency = summary.cheapestOverall?.currency;

  if (!Number.isFinite(currentBestPrice) || !currency) {
    return null;
  }

  const daysUntilDeparture = calculateDaysUntilDeparture(summary.request, now);
  const allObservations = [...observations].sort((left, right) =>
    left.observedAt.localeCompare(right.observedAt)
  );
  const comparableMarketObservations = [...marketObservations].sort((left, right) =>
    left.observedAt.localeCompare(right.observedAt)
  );
  const observedPrices = allObservations
    .map((observation) => observation.bestPrice)
    .filter((price) => Number.isFinite(price))
    .sort((left, right) => left - right);

  const observedLowPrice = observedPrices[0] ?? currentBestPrice;
  const observedHighPrice =
    observedPrices[observedPrices.length - 1] ?? currentBestPrice;
  const observedMedianPrice = percentile(observedPrices, 0.5) || currentBestPrice;
  const trend = getTrend(allObservations);
  const historySampleSize = allObservations.length;
  const pricePosition = getPricePosition(
    currentBestPrice,
    observedLowPrice,
    observedMedianPrice,
    historySampleSize
  );
  const routeKind = getRouteKind(summary.request);
  const routeWindowSignal = formatRouteWindowReason(routeKind, daysUntilDeparture);
  const currentObservation = allObservations[allObservations.length - 1];
  const recentVolatility = average(
    allObservations
      .slice(-5)
      .map((observation) => observation.volatility)
      .filter((value): value is number => value !== null)
  );
  const effectiveMarketMetrics =
    marketPriceMetrics ??
    buildLocalMarketPriceMetrics(comparableMarketObservations, currency) ??
    buildLocalMarketPriceMetrics(allObservations, currency);
  const marketPriceReason = buildMarketPriceReason(
    currentBestPrice,
    effectiveMarketMetrics
  );
  const projection = buildFuturePriceProjection(
    allObservations,
    currentBestPrice,
    daysUntilDeparture,
    effectiveMarketMetrics
  );
  const signals: TimingSignal[] = [];
  const materialMovementThreshold = Math.max(currentBestPrice * 0.03, 15);
  const airlineBaselineSignal = buildAirlineBaselineSignal(
    currentObservation,
    comparableMarketObservations.slice(0, -1),
    currency
  );

  if (routeWindowSignal) {
    signals.push({
      priority: 2.5,
      reason: routeWindowSignal.reason,
      score: routeWindowSignal.score
    });
  }

  if (pricePosition === "near_low") {
    signals.push({
      priority: 3,
      reason:
      `The current fare is within 3% of the lowest price this app has seen across ${historySampleSize} check${
        historySampleSize === 1 ? "" : "s"
      } for this exact trip.`,
      score: 2
    });
  } else if (pricePosition === "high") {
    signals.push({
      priority: 3,
      reason:
        "The current fare is noticeably above the recent range for this exact trip watch.",
      score: -2
    });
  }

  if (trend === "rising") {
    signals.push({
      priority: 2.5,
      reason: "Recent checks for this trip have been trending upward.",
      score: 2
    });
  } else if (trend === "falling") {
    signals.push({
      priority: 2.5,
      reason: "Recent checks for this trip have been trending downward.",
      score: -2
    });
  } else if (trend === "flat" && historySampleSize >= 4) {
    signals.push({
      priority: 1.5,
      reason:
        "Recent checks have been fairly flat, so there may not be much downside left.",
      score: 1
    });
  }

  if (projection) {
    if (
      projection.riskAmount >=
      Math.max(projection.savingsAmount * 1.2, materialMovementThreshold)
    ) {
      signals.push({
        priority: 4,
        reason: `A ${projection.horizonDays}-day projection points to about ${formatPrice(
          Math.round(projection.forecastPrice),
          currency
        )}, with roughly ${formatPrice(
          Math.round(projection.riskAmount),
          currency
        )} of modeled upside risk and only about ${formatPrice(
          Math.round(projection.savingsAmount),
          currency
        )} of likely savings left.`,
        score:
          daysUntilDeparture > 90
            ? projection.riskAmount >= materialMovementThreshold * 2
              ? 1
              : 0.5
            : projection.riskAmount >= materialMovementThreshold * 1.5
              ? 3
              : 1.5
      });
    } else if (
      daysUntilDeparture > 14 &&
      projection.savingsAmount >=
        Math.max(projection.riskAmount * 1.2, materialMovementThreshold)
    ) {
      signals.push({
        priority: 4,
        reason: `A ${projection.horizonDays}-day projection still leaves room for about ${formatPrice(
          Math.round(projection.savingsAmount),
          currency
        )} of additional downside, while the modeled rebound risk is only about ${formatPrice(
          Math.round(projection.riskAmount),
          currency
        )}.`,
        score: projection.savingsAmount >= materialMovementThreshold * 1.5 ? -3 : -1.5
      });
    }
  }

  if (
    marketPriceReason &&
    (marketPriceReason.score !== 0 || effectiveMarketMetrics?.source === "amadeus")
  ) {
    signals.push({
      priority: 2,
      reason: marketPriceReason.reason,
      score: marketPriceReason.score
    });
  }

  if (airlineBaselineSignal) {
    signals.push(airlineBaselineSignal);
  }

  if (
    currentObservation &&
    currentObservation.volatility !== null &&
    currentObservation.volatility >= 0.18
  ) {
    signals.push({
      priority: 1.5,
      reason:
        daysUntilDeparture > 30 && trend !== "rising"
          ? `The cheapest few qualifying fares in this search are still spread across about ${Math.round(
              currentObservation.volatility * 100
            )}%, which usually means there is still room for one more dip.`
          : `The cheapest few qualifying fares in this search are spread across about ${Math.round(
              currentObservation.volatility * 100
            )}%, so this route is still moving around.`,
      score: daysUntilDeparture > 30 && trend !== "rising" ? -1 : 0.5
    });
  }

  if (
    currentObservation &&
    currentObservation.optionCount >= 3 &&
    currentObservation.directAirlineCount > 0 &&
    currentObservation.otaCount === 0 &&
    currentObservation.mixedOrUnknownCount === 0
  ) {
    signals.push({
      priority: 1,
      reason:
        "The cheapest qualifying options in this check are all direct-airline fares rather than OTA listings.",
      score: 0.5
    });
  }

  if (
    currentObservation &&
    currentObservation.airlineMix.length >= 3 &&
    daysUntilDeparture > 30 &&
    trend !== "rising"
  ) {
    signals.push({
      priority: 0.75,
      reason:
        "Several airlines are still competing near the top of this search, which usually gives the market a little more room to reprice.",
      score: -0.5
    });
  }

  const score = signals.reduce((total, signal) => total + signal.score, 0);
  const recommendation: TimingRecommendation = score >= 1 ? "book_now" : "wait";
  const confidence = determineConfidence(
    historySampleSize,
    Math.abs(score),
    routeWindowSignal !== null,
    trend,
    pricePosition,
    effectiveMarketMetrics !== null,
    recentVolatility !== null,
    projection !== null,
    airlineBaselineSignal !== null
  );
  const reasons = signals
    .sort(
      (left, right) =>
        Math.abs(right.score) - Math.abs(left.score) ||
        right.priority - left.priority
    )
    .map((signal) => signal.reason);

  return {
    recommendation,
    confidence,
    headline: recommendation === "book_now" ? "Book now" : "Wait",
    summary: summarizeRecommendation(
      recommendation,
      pricePosition,
      trend,
      daysUntilDeparture,
      projection
    ),
    reasons: reasons.slice(0, 3),
    currentBestPrice,
    currency,
    observedLowPrice,
    observedMedianPrice,
    observedHighPrice,
    pricePosition,
    trend,
    historySampleSize,
    daysUntilDeparture
  };
}

export class TimingGuidanceService {
  private readonly amadeusClient: Pick<
    AmadeusClient,
    "getItineraryPriceMetrics"
  > | null;

  private readonly historyCache: Pick<JsonFileCache<TimingObservation[]>, "get" | "set">;

  private readonly routeHistoryCache: Pick<
    JsonFileCache<TimingObservation[]>,
    "get" | "set"
  >;

  private readonly marketPriceCache: Pick<
    JsonFileCache<TimingMarketPriceCacheEntry>,
    "get" | "set"
  >;

  constructor(options: TimingGuidanceServiceOptions = {}) {
    this.historyCache =
      options.historyCache ??
      new JsonFileCache<TimingObservation[]>({
        directorySegments: [".cache", "timing-guidance"],
        ttlMs: dayMs * 180,
        maxEntries: 1200,
        version: 2
      });
    this.routeHistoryCache =
      options.routeHistoryCache ??
      new JsonFileCache<TimingObservation[]>({
        directorySegments: [".cache", "timing-market-history"],
        ttlMs: dayMs * 180,
        maxEntries: 1800,
        version: 1
      });
    this.marketPriceCache =
      options.marketPriceCache ??
      new JsonFileCache<TimingMarketPriceCacheEntry>({
        directorySegments: [".cache", "timing-price-analysis"],
        ttlMs: dayMs * 14,
        maxEntries: 1200,
        version: 1
      });
    this.amadeusClient =
      options.amadeusClient === undefined
        ? createAmadeusClientFromEnv()
        : options.amadeusClient;
  }

  async annotateSummary(
    summary: SearchSummary,
    options: FlightOption[],
    now = new Date()
  ): Promise<SearchSummary> {
    const currentBestPrice = summary.cheapestOverall?.totalPrice ?? Number.NaN;
    const currency = summary.cheapestOverall?.currency;

    if (!Number.isFinite(currentBestPrice) || !currency) {
      return {
        ...summary,
        timingGuidance: null,
        priceAlert: null,
        hackerFareInsight: buildHackerFareInsight(summary)
      };
    }

    const key = buildWatchKey(summary.request);
    const marketKey = buildMarketWatchKey(summary.request);
    const history = this.historyCache.get(key) ?? [];
    const routeHistory = this.routeHistoryCache.get(marketKey) ?? [];
    const observation = buildObservation(summary, options, now);
    const nextHistory = observation
      ? [...history, observation].slice(-maxHistoryEntries)
      : history;
    const nextRouteHistory = observation
      ? [...routeHistory, observation].slice(-maxRouteHistoryEntries)
      : routeHistory;
    const marketPriceMetrics = await this.getMarketPriceMetrics(
      summary,
      nextHistory,
      nextRouteHistory
    );
    const guidance = buildTimingGuidance(
      summary,
      nextHistory,
      now,
      marketPriceMetrics,
      nextRouteHistory
    );
    const priceAlert = buildPriceAlert(currentBestPrice, currency, nextHistory);
    const hackerFareInsight = buildHackerFareInsight(summary);

    if (observation) {
      this.historyCache.set(key, nextHistory);
      this.routeHistoryCache.set(marketKey, nextRouteHistory);
    }

    return {
      ...summary,
      timingGuidance: guidance,
      priceAlert,
      hackerFareInsight
    };
  }

  private async getMarketPriceMetrics(
    summary: SearchSummary,
    history: TimingObservation[],
    routeHistory: TimingObservation[]
  ): Promise<TimingMarketPriceMetrics | null> {
    const currentBest = summary.cheapestOverall;
    if (!currentBest?.currency) {
      return null;
    }

    const localMetrics =
      buildLocalMarketPriceMetrics(routeHistory, currentBest.currency) ??
      buildLocalMarketPriceMetrics(history, currentBest.currency);
    if (!this.amadeusClient || !currentBest.outboundDate) {
      return localMetrics;
    }

    const cacheKey = {
      currencyCode: currentBest.currency,
      departureDate: currentBest.outboundDate,
      destinationIataCode: summary.request.destination,
      oneWay: summary.request.tripType === "one_way",
      originIataCode: summary.request.origin
    };
    const cachedEntry = this.marketPriceCache.get(cacheKey);
    if (cachedEntry) {
      return cachedEntry.status === "hit" ? cachedEntry.metrics : localMetrics;
    }

    try {
      const entries = await this.amadeusClient.getItineraryPriceMetrics({
        originIataCode: summary.request.origin,
        destinationIataCode: summary.request.destination,
        departureDate: currentBest.outboundDate,
        currencyCode: currentBest.currency,
        oneWay: summary.request.tripType === "one_way"
      });
      const metrics = buildAmadeusMarketPriceMetrics(entries, currentBest.currency);

      if (metrics) {
        this.marketPriceCache.set(cacheKey, {
          status: "hit",
          metrics
        });
        return metrics;
      }
    } catch {
      // Route coverage is incomplete for Amadeus price analysis, so falling back
      // silently to local emulation is expected and keeps the search resilient.
    }

    this.marketPriceCache.set(cacheKey, {
      status: "miss"
    });
    return localMetrics;
  }
}
