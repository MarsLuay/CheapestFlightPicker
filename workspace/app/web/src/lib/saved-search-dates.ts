import type { SearchRequest } from "./types";

import { formatDateForInput } from "./date-input";

const savedSearchDatesStorageKey = "cheapest-flight-picker.saved-search-dates";

type StorageLike = Pick<Storage, "getItem" | "removeItem" | "setItem">;

export type SavedSearchDates = {
  departureDateFrom: SearchRequest["departureDateFrom"];
  departureDateTo: SearchRequest["departureDateTo"];
  returnDateFrom: NonNullable<SearchRequest["returnDateFrom"]>;
  returnDateTo: NonNullable<SearchRequest["returnDateTo"]>;
};

function getBrowserStorage(): StorageLike | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function normalizeDateInput(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalizedValue = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/u.test(normalizedValue) ? normalizedValue : null;
}

function normalizeSavedSearchDates(
  value: unknown,
  today = formatDateForInput(new Date())
): SavedSearchDates | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const departureDateFrom = normalizeDateInput(record.departureDateFrom);
  const departureDateTo = normalizeDateInput(record.departureDateTo);
  const returnDateFrom = normalizeDateInput(record.returnDateFrom);
  const returnDateTo = normalizeDateInput(record.returnDateTo);

  if (!departureDateFrom || !departureDateTo || !returnDateFrom || !returnDateTo) {
    return null;
  }

  if (departureDateFrom > departureDateTo || returnDateFrom > returnDateTo) {
    return null;
  }

  const savedDates = [
    departureDateFrom,
    departureDateTo,
    returnDateFrom,
    returnDateTo
  ];
  if (savedDates.some((date) => date < today)) {
    return null;
  }

  return {
    departureDateFrom,
    departureDateTo,
    returnDateFrom,
    returnDateTo
  };
}

export function loadSavedSearchDates(
  storage = getBrowserStorage(),
  today = formatDateForInput(new Date())
): SavedSearchDates | null {
  if (!storage) {
    return null;
  }

  try {
    const rawValue = storage.getItem(savedSearchDatesStorageKey);
    if (!rawValue) {
      return null;
    }

    const savedSearchDates = normalizeSavedSearchDates(JSON.parse(rawValue), today);
    if (!savedSearchDates) {
      storage.removeItem(savedSearchDatesStorageKey);
      return null;
    }

    return savedSearchDates;
  } catch {
    return null;
  }
}

export function saveSavedSearchDates(
  request: SavedSearchDates,
  storage = getBrowserStorage(),
  today = formatDateForInput(new Date())
): void {
  if (!storage) {
    return;
  }

  const normalizedDates = normalizeSavedSearchDates(request, today);
  if (!normalizedDates) {
    return;
  }

  try {
    storage.setItem(
      savedSearchDatesStorageKey,
      JSON.stringify(normalizedDates)
    );
  } catch {
    // Ignore persistence failures so the UI still works normally.
  }
}
