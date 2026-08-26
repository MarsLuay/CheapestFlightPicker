import type { SearchRequest, TimeWindow } from "./types";

import {
  getBrowserStorage,
  persistJsonToStorage,
} from "./browser-storage";

const savedSearchPreferencesStorageKey =
  "cheapest-flight-picker.saved-search-preferences";

type SavedSearchPreferences = Pick<
  SearchRequest,
  | "arrivalTimeWindow"
  | "departureTimeWindow"
  | "destination"
  | "maximumTripDays"
  | "minimumTripDays"
  | "origin"
  | "prioritizeMileFlights"
  | "requireFreeCarryOnBag"
  | "tripType"
  | "useExactDates"
>;

function normalizeAirportCode(
  value: unknown,
  options?: { allowBlank?: boolean }
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalizedValue = value.trim().toUpperCase();
  if (options?.allowBlank && normalizedValue === "") {
    return "";
  }

  return /^[A-Z]{3}$/u.test(normalizedValue) ? normalizedValue : null;
}

function normalizeTripLength(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Math.max(0, Math.min(180, Math.round(value)));
}

function normalizeBoolean(value: unknown): boolean | null {
  if (typeof value !== "boolean") {
    return null;
  }

  return value;
}

function normalizeTripType(
  value: unknown
): SearchRequest["tripType"] | null {
  if (value === undefined) {
    // Existing saved records predate trip-type persistence.
    return "round_trip";
  }

  return value === "one_way" || value === "round_trip" ? value : null;
}

function normalizeTimeWindow(value: unknown): TimeWindow | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<TimeWindow>;
  if (
    typeof candidate.from !== "number" ||
    typeof candidate.to !== "number" ||
    !Number.isFinite(candidate.from) ||
    !Number.isFinite(candidate.to)
  ) {
    return null;
  }

  const from = Math.max(0, Math.min(24, Math.round(candidate.from)));
  const to = Math.max(0, Math.min(24, Math.round(candidate.to)));

  if (from <= to) {
    return { from, to };
  }

  return { from: to, to: from };
}

function normalizeSavedSearchPreferences(
  value: unknown
): SavedSearchPreferences | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const origin = normalizeAirportCode(record.origin);
  const destination = normalizeAirportCode(record.destination, {
    allowBlank: true
  });
  const tripType = normalizeTripType(record.tripType);
  const useExactDates = normalizeBoolean(record.useExactDates);
  const prioritizeMileFlights =
    record.prioritizeMileFlights === undefined
      ? false
      : normalizeBoolean(record.prioritizeMileFlights);
  const requireFreeCarryOnBag =
    record.requireFreeCarryOnBag === undefined
      ? true
      : normalizeBoolean(record.requireFreeCarryOnBag);
  const minimumTripDays = normalizeTripLength(record.minimumTripDays);
  const maximumTripDays = normalizeTripLength(record.maximumTripDays);
  const departureTimeWindow = normalizeTimeWindow(record.departureTimeWindow);
  const arrivalTimeWindow = normalizeTimeWindow(record.arrivalTimeWindow);

  if (
    !origin ||
    destination === null ||
    tripType === null ||
    useExactDates === null ||
    prioritizeMileFlights === null ||
    requireFreeCarryOnBag === null ||
    minimumTripDays === null ||
    maximumTripDays === null ||
    !departureTimeWindow ||
    !arrivalTimeWindow
  ) {
    return null;
  }

  return {
    origin,
    destination,
    tripType,
    useExactDates,
    prioritizeMileFlights,
    requireFreeCarryOnBag,
    minimumTripDays: Math.min(minimumTripDays, maximumTripDays),
    maximumTripDays: Math.max(maximumTripDays, minimumTripDays),
    departureTimeWindow,
    arrivalTimeWindow
  };
}

export function loadSavedSearchPreferences(
  storage = getBrowserStorage()
): SavedSearchPreferences | null {
  if (!storage) {
    return null;
  }

  try {
    const rawValue = storage.getItem(savedSearchPreferencesStorageKey);
    if (!rawValue) {
      return null;
    }

    const savedPreferences = normalizeSavedSearchPreferences(JSON.parse(rawValue));
    if (!savedPreferences) {
      storage.removeItem(savedSearchPreferencesStorageKey);
      return null;
    }

    return savedPreferences;
  } catch {
    return null;
  }
}

export function saveSavedSearchPreferences(
  request: SavedSearchPreferences,
  storage = getBrowserStorage()
): void {
  if (!storage) {
    return;
  }

  const normalizedPreferences = normalizeSavedSearchPreferences(request);
  if (!normalizedPreferences) {
    return;
  }

  persistJsonToStorage(
    storage,
    savedSearchPreferencesStorageKey,
    normalizedPreferences
  );
}
