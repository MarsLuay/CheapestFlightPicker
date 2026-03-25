import { JsonFileCache } from "./cache";
import { findAirportByCode } from "./catalog";
import type {
  HackerFareInsight,
  PriceAlert,
  SearchRequest,
  SearchSummary,
  TimingConfidence,
  TimingGuidance,
  TimingPricePosition,
  TimingRecommendation,
  TimingTrend
} from "../shared/types";

type TimingObservation = {
  observedAt: string;
  bestPrice: number;
  currency: string;
  daysUntilDeparture: number;
};

const dayMs = 24 * 60 * 60 * 1000;
const maxHistoryEntries = 60;

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

function buildWatchKey(request: SearchRequest): Record<string, unknown> {
  return {
    airlines: request.airlines,
    arrivalTimeWindow: request.arrivalTimeWindow ?? null,
    cabinClass: request.cabinClass,
    departureDateFrom: request.departureDateFrom,
    departureDateTo: request.departureDateTo,
    departureTimeWindow: request.departureTimeWindow ?? null,
    destination: request.destination,
    maximumTripDays: request.maximumTripDays ?? 14,
    minimumTripDays: request.minimumTripDays ?? 0,
    origin: request.origin,
    passengers: request.passengers,
    preferDirectBookingOnly: request.preferDirectBookingOnly,
    returnDateFrom: request.returnDateFrom ?? null,
    returnDateTo: request.returnDateTo ?? null,
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
  daysUntilDeparture: number
): string {
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
  pricePosition: TimingPricePosition
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

  if (confidenceScore >= 5) {
    return "high";
  }

  if (confidenceScore >= 3) {
    return "medium";
  }

  return "low";
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
  now = new Date()
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
  const reasons: string[] = [];
  let score = 0;

  if (routeWindowSignal) {
    score += routeWindowSignal.score;
    reasons.push(routeWindowSignal.reason);
  }

  if (pricePosition === "near_low") {
    score += 2;
    reasons.push(
      `The current fare is within 3% of the lowest price this app has seen across ${historySampleSize} check${
        historySampleSize === 1 ? "" : "s"
      } for this exact trip.`
    );
  } else if (pricePosition === "high") {
    score -= 2;
    reasons.push(
      "The current fare is noticeably above the recent range for this exact trip watch."
    );
  }

  if (trend === "rising") {
    score += 2;
    reasons.push("Recent checks for this trip have been trending upward.");
  } else if (trend === "falling") {
    score -= 2;
    reasons.push("Recent checks for this trip have been trending downward.");
  } else if (trend === "flat" && historySampleSize >= 4) {
    score += 1;
    reasons.push("Recent checks have been fairly flat, so there may not be much downside left.");
  }

  const recommendation: TimingRecommendation = score >= 1 ? "book_now" : "wait";
  const confidence = determineConfidence(
    historySampleSize,
    Math.abs(score),
    routeWindowSignal !== null,
    trend,
    pricePosition
  );

  return {
    recommendation,
    confidence,
    headline: recommendation === "book_now" ? "Book now" : "Wait",
    summary: summarizeRecommendation(
      recommendation,
      pricePosition,
      trend,
      daysUntilDeparture
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
  private readonly historyCache = new JsonFileCache<TimingObservation[]>({
    directorySegments: [".cache", "timing-guidance"],
    ttlMs: dayMs * 180,
    maxEntries: 1200
  });

  annotateSummary(summary: SearchSummary, now = new Date()): SearchSummary {
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
    const history = this.historyCache.get(key) ?? [];
    const observation: TimingObservation = {
      observedAt: now.toISOString(),
      bestPrice: currentBestPrice,
      currency,
      daysUntilDeparture: calculateDaysUntilDeparture(summary.request, now)
    };
    const nextHistory = [...history, observation].slice(-maxHistoryEntries);
    const guidance = buildTimingGuidance(summary, nextHistory, now);
    const priceAlert = buildPriceAlert(currentBestPrice, currency, nextHistory);
    const hackerFareInsight = buildHackerFareInsight(summary);

    this.historyCache.set(key, nextHistory);

    return {
      ...summary,
      timingGuidance: guidance,
      priceAlert,
      hackerFareInsight
    };
  }
}
