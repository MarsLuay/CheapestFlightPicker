export const cabinClassValues = [
  "economy",
  "premium_economy",
  "business",
  "first"
] as const;

export const stopsFilterValues = [
  "any",
  "nonstop",
  "max_1_stop",
  "max_2_stops"
] as const;

export const tripTypeValues = ["one_way", "round_trip"] as const;

export type CabinClass = (typeof cabinClassValues)[number];
export type StopsFilter = (typeof stopsFilterValues)[number];
export type TripType = (typeof tripTypeValues)[number];

export type TimeWindow = {
  from: number;
  to: number;
};

export type PassengerCounts = {
  adults: number;
  children: number;
  infantsInSeat: number;
  infantsOnLap: number;
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
  tripType: TripType;
  origin: string;
  destination: string;
  departureDateFrom: string;
  departureDateTo: string;
  returnDateFrom?: string;
  returnDateTo?: string;
  minimumTripDays?: number;
  maximumTripDays?: number;
  departureTimeWindow?: TimeWindow | null;
  arrivalTimeWindow?: TimeWindow | null;
  cabinClass: CabinClass;
  stopsFilter: StopsFilter;
  preferDirectBookingOnly: boolean;
  airlines: string[];
  passengers: PassengerCounts;
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
  active: boolean;
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

export type SearchSummary = {
  request: SearchRequest;
  departureDatePrices: DatePrice[];
  returnDatePrices: DatePrice[];
  cheapestOverall: FlightOption | null;
  cheapestRoundTrip: FlightOption | null;
  cheapestTwoOneWays: FlightOption | null;
  cheapestDirectThere: FlightOption | null;
  cheapestMultiStop: FlightOption | null;
  evaluatedDatePairs: Array<{
    departureDate: string;
    returnDate?: string;
  }>;
  inspectedOptions: number;
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
