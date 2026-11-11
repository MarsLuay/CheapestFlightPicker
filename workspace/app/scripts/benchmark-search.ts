import { FlightSearchService } from "../src/core/search";
import type { FlightSearchProvider } from "../src/core/search-provider";
import type { ExactFlightSearchParams } from "../src/providers/google-flights/types";
import type {
  DatePrice,
  FlightOption,
  SearchPerformanceMetrics,
  SearchRequest,
  SearchSummary
} from "../src/shared/types";

const warmupCount = 3;
const sampleCount = 11;
const dateCount = 365;
const firstDate = Date.UTC(2030, 0, 1);
const calendarDates = Array.from({ length: dateCount }, (_, index) =>
  new Date(firstDate + index * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)
);
const departures = calendarDates
  .map((date, index) => ({ date, price: 70 + ((index * 97) % 420) }))
  .sort(
    (left, right) => left.price - right.price || left.date.localeCompare(right.date)
  );
const returns = departures;
const departurePriceByDate = new Map(
  departures.map((entry) => [entry.date, entry.price])
);
const returnPriceByDate = new Map(
  returns.map((entry) => [entry.date, entry.price])
);
const request: SearchRequest = {
  tripType: "round_trip",
  origin: "SEA",
  destination: "PIT",
  departureDateFrom: calendarDates[0] ?? "2030-01-01",
  departureDateTo: calendarDates[calendarDates.length - 1] ?? "2030-12-31",
  returnDateFrom: calendarDates[0] ?? "2030-01-01",
  returnDateTo: calendarDates[calendarDates.length - 1] ?? "2030-12-31",
  minimumTripDays: 1,
  maximumTripDays: 180,
  cabinClass: "economy",
  stopsFilter: "any",
  preferDirectBookingOnly: false,
  airlines: [],
  passengers: {
    adults: 1,
    children: 0,
    infantsInSeat: 0,
    infantsOnLap: 0
  },
  maxResults: 12
};

function buildFixtureOption(params: ExactFlightSearchParams): FlightOption {
  const source =
    params.tripType === "round_trip" ? "google_round_trip" : "google_one_way";
  const outboundPriceByDate =
    params.origin === request.origin
      ? departurePriceByDate
      : returnPriceByDate;
  const totalPrice =
    (outboundPriceByDate.get(params.departureDate) ?? 100) +
    (params.returnDate ? returnPriceByDate.get(params.returnDate) ?? 100 : 0);

  return {
    source,
    totalPrice,
    currency: "USD",
    slices: Array.from(
      { length: params.tripType === "round_trip" ? 2 : 1 },
      () => ({ durationMinutes: 120, stops: 0, legs: [] })
    ),
    bookingSource: {
      type: "direct_airline",
      label: "Synthetic benchmark fare",
      detected: true
    },
    outboundDate: params.departureDate,
    returnDate: params.returnDate
  };
}

const provider: FlightSearchProvider = {
  async searchOneWayWithinWindow(
    _searchRequest: SearchRequest,
    origin: string
  ): Promise<DatePrice[]> {
    return origin === request.origin ? departures : returns;
  },
  async searchExactFlights(params: ExactFlightSearchParams) {
    return [buildFixtureOption(params)];
  }
};

function percentile(values: number[], value: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil((sorted.length - 1) * value)] ?? 0;
}

async function runBenchmark(): Promise<void> {
  const service = new FlightSearchService(provider);
  const serviceWithStubbedGuidance = service as unknown as {
    timingGuidanceService: {
      annotateSummary(summary: SearchSummary): Promise<SearchSummary>;
    };
  };
  serviceWithStubbedGuidance.timingGuidanceService = {
    async annotateSummary(summary) {
      return summary;
    }
  };

  for (let index = 0; index < warmupCount; index += 1) {
    await service.search(request);
  }

  const samples: SearchPerformanceMetrics[] = [];
  for (let index = 0; index < sampleCount; index += 1) {
    const summary = await service.search(request);
    if (!summary.performance) {
      throw new Error("FlightSearchService did not return performance metrics");
    }
    samples.push(summary.performance);
  }

  console.log(
    JSON.stringify(
      {
        benchmark: "round-trip search with synthetic provider responses",
        fixture: {
          dateCandidatesPerDirection: dateCount,
          maximumTripLengthDays: request.maximumTripDays,
          targetDatePairs: Math.max(request.maxResults * 2, 8),
          warmupSamples: warmupCount,
          measuredSamples: sampleCount,
          googleFlightsNetwork: "stubbed; no external requests"
        },
        elapsedMs: {
          median: percentile(samples.map((sample) => sample.elapsedMs), 0.5),
          p95: percentile(samples.map((sample) => sample.elapsedMs), 0.95)
        },
        rankingMs: {
          median: percentile(samples.map((sample) => sample.rankingMs), 0.5),
          p95: percentile(samples.map((sample) => sample.rankingMs), 0.95)
        },
        lastSample: samples[samples.length - 1]
      },
      null,
      2
    )
  );
}

runBenchmark().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
