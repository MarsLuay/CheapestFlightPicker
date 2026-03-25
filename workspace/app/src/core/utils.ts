import type {
  BookingSource,
  FlightOption,
  FlightSlice,
  TimeWindow
} from "../shared/types";

export function createUnknownBookingSource(): BookingSource {
  return {
    type: "unknown",
    label: "Booking source not confirmed",
    detected: false
  };
}

export function combineBookingSources(
  sources: Array<BookingSource | null | undefined>
): BookingSource {
  const detectedSources = sources.filter(
    (source): source is BookingSource => Boolean(source && source.detected)
  );

  if (detectedSources.length === 0) {
    return createUnknownBookingSource();
  }

  const uniqueTypes = new Set(detectedSources.map((source) => source.type));
  const uniqueSellerNames = new Set(
    detectedSources
      .map((source) => source.sellerName?.trim())
      .filter((name): name is string => Boolean(name))
  );

  if (uniqueTypes.size === 1 && uniqueTypes.has("direct_airline")) {
    const sellerName =
      uniqueSellerNames.size === 1
        ? [...uniqueSellerNames][0]
        : undefined;

    return {
      type: "direct_airline",
      label: sellerName ? `Direct with ${sellerName}` : "Direct airline fare",
      sellerName,
      detected: true
    };
  }

  if (uniqueTypes.size === 1 && uniqueTypes.has("ota")) {
    const sellerName =
      uniqueSellerNames.size === 1
        ? [...uniqueSellerNames][0]
        : undefined;

    return {
      type: "ota",
      label: sellerName ? `OTA: ${sellerName}` : "Online travel agency fare",
      sellerName,
      detected: true
    };
  }

  return {
    type: "mixed",
    label: "Mixed booking sources",
    detected: true
  };
}

export function prefersDirectBooking(source: BookingSource): boolean {
  return source.type !== "ota" && source.type !== "mixed";
}

export function clampTimeWindow(
  window: TimeWindow | null | undefined
): TimeWindow | undefined {
  if (!window) {
    return undefined;
  }

  const rawFrom = Math.max(0, Math.min(24, Math.round(window.from)));
  const rawTo = Math.max(0, Math.min(24, Math.round(window.to)));

  if (rawFrom === 0 && rawTo === 24) {
    return undefined;
  }

  // Google Flights appears to treat 24 as an invalid hour bound. We keep 24
  // in the UI to mean "through the end of the day", then normalize it here.
  const from = rawFrom === 24 ? 23 : rawFrom;
  const to = rawTo === 24 ? 23 : rawTo;

  if (from <= to) {
    return { from, to };
  }

  return { from: to, to: from };
}

export function stopFilterToGoogleValue(filter: string): number {
  switch (filter) {
    case "nonstop":
      return 1;
    case "max_1_stop":
      return 2;
    case "max_2_stops":
      return 3;
    default:
      return 0;
  }
}

export function cabinClassToGoogleValue(cabinClass: string): number {
  switch (cabinClass) {
    case "premium_economy":
      return 2;
    case "business":
      return 3;
    case "first":
      return 4;
    default:
      return 1;
  }
}

export function combineTwoOneWays(
  outbound: FlightOption,
  inbound: FlightOption,
  departureDate: string,
  returnDate: string
): FlightOption {
  return {
    source: "two_one_way_combo",
    totalPrice: outbound.totalPrice + inbound.totalPrice,
    currency: outbound.currency,
    slices: [...outbound.slices, ...inbound.slices],
    slicePrices: [outbound.totalPrice, inbound.totalPrice],
    bookingSource: combineBookingSources([
      outbound.bookingSource,
      inbound.bookingSource
    ]),
    outboundDate: departureDate,
    returnDate,
    notes: [
      "Combined from separate one-way searches",
      `Outbound ${departureDate}`,
      `Return ${returnDate}`
    ]
  };
}

export function findCheapest(options: FlightOption[]): FlightOption | null {
  if (options.length === 0) {
    return null;
  }

  return options.reduce((best, current) => {
    return current.totalPrice < best.totalPrice ? current : best;
  });
}

export function findCheapestDirectThere(
  options: FlightOption[]
): FlightOption | null {
  const matches = options.filter((option) => option.slices[0]?.stops === 0);
  return findCheapest(matches);
}

export function findCheapestMultiStop(
  options: FlightOption[]
): FlightOption | null {
  const matches = options.filter((option) =>
    option.slices.some((slice) => slice.stops > 0)
  );

  return findCheapest(matches);
}

export function summarizeSlice(slice: FlightSlice): string {
  const start = slice.legs[0];
  const end = slice.legs[slice.legs.length - 1];
  if (!start || !end) {
    return "Unknown segment";
  }

  const stopsLabel =
    slice.stops === 0
      ? "nonstop"
      : `${slice.stops} stop${slice.stops === 1 ? "" : "s"}`;
  return `${start.departureAirportCode} -> ${end.arrivalAirportCode} (${stopsLabel})`;
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;

  async function worker(): Promise<void> {
    while (index < items.length) {
      const currentIndex = index;
      index += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }

  const workers = Array.from(
    { length: Math.max(1, concurrency) },
    () => worker()
  );
  await Promise.all(workers);
  return results;
}
