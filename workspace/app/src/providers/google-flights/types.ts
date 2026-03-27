import type {
  BookingSource,
  PassengerCounts,
  TimeWindow
} from "../../shared/types";

export type CalendarSearchParams = {
  origin: string;
  destination: string;
  fromDate: string;
  toDate: string;
  travelDate: string;
  cabinClass: string;
  stopsFilter: string;
  requireFreeCarryOnBag?: boolean;
  airlines: string[];
  passengers: PassengerCounts;
  departureTimeWindow?: TimeWindow;
  arrivalTimeWindow?: TimeWindow;
};

export type ExactFlightSearchParams = {
  tripType: "one_way" | "round_trip";
  origin: string;
  destination: string;
  departureDate: string;
  returnDate?: string;
  cabinClass: string;
  stopsFilter: string;
  preferDirectBookingOnly?: boolean;
  requireFreeCarryOnBag?: boolean;
  airlines: string[];
  passengers: PassengerCounts;
  departureTimeWindow?: TimeWindow;
  arrivalTimeWindow?: TimeWindow;
  selectedFlight?: GoogleFlightResult;
};

export type GoogleFlightLeg = {
  airlineCode: string;
  airlineName: string;
  flightNumber: string;
  departureAirportCode: string;
  arrivalAirportCode: string;
  departureDateTime: Date;
  arrivalDateTime: Date;
  durationMinutes: number;
};

export type GoogleFlightResult = {
  price: number;
  durationMinutes: number;
  stops: number;
  legs: GoogleFlightLeg[];
  bookingSource: BookingSource;
};
