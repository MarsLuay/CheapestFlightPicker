export type TimeWindow = {
  from: number;
  to: number;
};

export type BookingSourceType =
  | "direct_airline"
  | "ota"
  | "mixed"
  | "unknown";

export type BookingSource = {
  type: BookingSourceType;
  label: string;
  sellerName?: string;
  url?: string;
  detected: boolean;
};

export type SearchRequest = {
  tripType: "one_way" | "round_trip";
  origin: string;
  destination: string;
  useExactDates?: boolean;
  departureDateFrom: string;
  departureDateTo: string;
  returnDateFrom?: string;
  returnDateTo?: string;
  minimumTripDays?: number;
  maximumTripDays?: number;
  departureTimeWindow?: TimeWindow | null;
  arrivalTimeWindow?: TimeWindow | null;
  cabinClass: "economy" | "premium_economy" | "business" | "first";
  stopsFilter: "any" | "nonstop" | "max_1_stop" | "max_2_stops";
  preferDirectBookingOnly: boolean;
  airlines: string[];
  passengers: {
    adults: number;
    children: number;
    infantsInSeat: number;
    infantsOnLap: number;
  };
  maxResults: number;
};

export type AirportRecord = {
  id: string;
  name: string;
  city: string;
  country: string;
  iata: string;
  icao: string;
  latitude: number;
  longitude: number;
};

export type AirlineRecord = {
  id: string;
  name: string;
  iata: string;
  icao: string;
  country: string;
};

export type DatePrice = {
  date: string;
  price: number;
};

export type FlightLeg = {
  airlineCode: string;
  airlineName: string;
  flightNumber: string;
  departureAirportCode: string;
  departureAirportName: string;
  departureDateTime: string;
  arrivalAirportCode: string;
  arrivalAirportName: string;
  arrivalDateTime: string;
  durationMinutes: number;
};

export type FlightSlice = {
  durationMinutes: number;
  stops: number;
  legs: FlightLeg[];
};

export type FlightOption = {
  source: "google_round_trip" | "google_one_way" | "two_one_way_combo";
  totalPrice: number;
  currency: string;
  slices: FlightSlice[];
  slicePrices?: number[];
  bookingSource: BookingSource;
  outboundDate?: string;
  returnDate?: string;
  notes?: string[];
};

export type TimingRecommendation = "book_now" | "wait";

export type TimingConfidence = "low" | "medium" | "high";

export type TimingTrend = "rising" | "falling" | "flat" | "unknown";

export type TimingPricePosition = "near_low" | "typical" | "high" | "unknown";

export type TimingGuidance = {
  recommendation: TimingRecommendation;
  confidence: TimingConfidence;
  headline: string;
  summary: string;
  reasons: string[];
  currentBestPrice: number;
  currency: string;
  observedLowPrice: number;
  observedMedianPrice: number;
  observedHighPrice: number;
  pricePosition: TimingPricePosition;
  trend: TimingTrend;
  historySampleSize: number;
  daysUntilDeparture: number;
};

export type PriceAlertKind =
  | "new_low"
  | "significant_drop"
  | "significant_rise";

export type PriceAlert = {
  kind: PriceAlertKind;
  headline: string;
  summary: string;
  changeAmount: number;
  changePercent: number;
  previousBestPrice: number;
  currentBestPrice: number;
  currency: string;
};

export type HackerFareInsight = {
  savingsAmount: number;
  savingsPercent: number;
  hackerFarePrice: number;
  traditionalRoundTripPrice: number;
  currency: string;
  headline: string;
  summary: string;
};

export type SearchSummary = {
  request: SearchRequest;
  departureDatePrices: DatePrice[];
  returnDatePrices: DatePrice[];
  cheapestOverall: FlightOption | null;
  cheapestRoundTrip: FlightOption | null;
  cheapestTwoOneWays: FlightOption | null;
  cheapestDirectThere: FlightOption | null;
  cheapestDirectReturn: FlightOption | null;
  cheapestMultiStop: FlightOption | null;
  evaluatedDatePairs: Array<{
    departureDate: string;
    returnDate?: string;
  }>;
  inspectedOptions: number;
  timingGuidance: TimingGuidance | null;
  priceAlert: PriceAlert | null;
  hackerFareInsight: HackerFareInsight | null;
};

export type SearchProgress = {
  stage: string;
  detail?: string;
  completedSteps: number;
  totalSteps: number;
  percent: number;
};

export type SearchJobStatus = {
  id: string;
  status: "queued" | "running" | "completed" | "failed";
  createdAt: string;
  updatedAt: string;
  progress: SearchProgress;
  summary?: SearchSummary;
  error?: string;
};

export type SearchResponse =
  | {
      ok: true;
      summary: SearchSummary;
    }
  | {
      ok: false;
      error: string;
    };

export type ServerLogEntry = {
  id: string;
  timestamp: string;
  level: "info" | "error";
  message: string;
  details?: Record<string, unknown>;
};
