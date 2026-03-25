import {
  cabinClassToGoogleValue,
  clampTimeWindow,
  stopFilterToGoogleValue
} from "../../core/utils";
import type { CalendarSearchParams, ExactFlightSearchParams } from "./types";

function encodeWrappedPayload(payload: unknown): string {
  const json = JSON.stringify(payload);
  const wrapped = [null, json];
  return encodeURIComponent(JSON.stringify(wrapped));
}

function buildSegment(
  origin: string,
  destination: string,
  travelDate: string,
  params: {
    departureTimeWindow?: { from: number; to: number };
    arrivalTimeWindow?: { from: number; to: number };
    stopsFilter: string;
    airlines: string[];
    selectedFlight?: ExactFlightSearchParams["selectedFlight"];
  }
) {
  const departureAirports = [[[origin, 0]]];
  const arrivalAirports = [[[destination, 0]]];

  const departureWindow = clampTimeWindow(params.departureTimeWindow);
  const arrivalWindow = clampTimeWindow(params.arrivalTimeWindow);
  const timeFilters =
    departureWindow || arrivalWindow
      ? [
          departureWindow?.from ?? null,
          departureWindow?.to ?? null,
          arrivalWindow?.from ?? null,
          arrivalWindow?.to ?? null
        ]
      : null;

  let selectedFlights: Array<[string, string, string, null, string, string]> | null =
    null;
  if (params.selectedFlight) {
    selectedFlights = params.selectedFlight.legs.map((leg) => [
      leg.departureAirportCode,
      leg.departureDateTime.toISOString().split("T")[0] ?? travelDate,
      leg.arrivalAirportCode,
      null,
      leg.airlineCode,
      leg.flightNumber
    ]);
  }

  return [
    departureAirports,
    arrivalAirports,
    timeFilters,
    stopFilterToGoogleValue(params.stopsFilter),
    params.airlines.length > 0 ? [...params.airlines].sort() : null,
    null,
    travelDate,
    null,
    selectedFlights,
    null,
    null,
    null,
    null,
    null,
    3
  ];
}

export function encodeCalendarSearch(params: CalendarSearchParams): string {
  const segment = buildSegment(
    params.origin,
    params.destination,
    params.travelDate,
    {
      departureTimeWindow: params.departureTimeWindow,
      arrivalTimeWindow: params.arrivalTimeWindow,
      stopsFilter: params.stopsFilter,
      airlines: params.airlines
    }
  );

  const payload = [
    null,
    [
      null,
      null,
      2,
      null,
      [],
      cabinClassToGoogleValue(params.cabinClass),
      [
        params.passengers.adults,
        params.passengers.children,
        params.passengers.infantsOnLap,
        params.passengers.infantsInSeat
      ],
      null,
      null,
      null,
      null,
      null,
      null,
      [segment],
      null,
      null,
      null,
      1
    ],
    [params.fromDate, params.toDate]
  ];

  return encodeWrappedPayload(payload);
}

export function encodeExactSearch(params: ExactFlightSearchParams): string {
  const segments = [
    buildSegment(params.origin, params.destination, params.departureDate, {
      departureTimeWindow: params.departureTimeWindow,
      arrivalTimeWindow: params.arrivalTimeWindow,
      stopsFilter: params.stopsFilter,
      airlines: params.airlines,
      selectedFlight: params.selectedFlight
    })
  ];

  if (params.tripType === "round_trip" && params.returnDate) {
    segments.push(
      buildSegment(params.destination, params.origin, params.returnDate, {
        departureTimeWindow: params.departureTimeWindow,
        arrivalTimeWindow: params.arrivalTimeWindow,
        stopsFilter: params.stopsFilter,
        airlines: params.airlines
      })
    );
  }

  const payload = [
    [],
    [
      null,
      null,
      params.tripType === "round_trip" ? 1 : 2,
      null,
      [],
      cabinClassToGoogleValue(params.cabinClass),
      [
        params.passengers.adults,
        params.passengers.children,
        params.passengers.infantsOnLap,
        params.passengers.infantsInSeat
      ],
      null,
      null,
      null,
      null,
      null,
      null,
      segments,
      null,
      null,
      null,
      1
    ],
    0,
    0,
    0,
    2
  ];

  return encodeWrappedPayload(payload);
}
