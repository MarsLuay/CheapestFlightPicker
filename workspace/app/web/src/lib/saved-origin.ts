const savedOriginStorageKey = "cheapest-flight-picker.saved-origin";

type StorageLike = Pick<Storage, "getItem" | "removeItem" | "setItem">;

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

function normalizeAirportCode(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalizedValue = value.trim().toUpperCase();
  return /^[A-Z]{3}$/u.test(normalizedValue) ? normalizedValue : null;
}

export function loadSavedOrigin(storage = getBrowserStorage()): string | null {
  if (!storage) {
    return null;
  }

  try {
    const savedOrigin = normalizeAirportCode(storage.getItem(savedOriginStorageKey));

    if (!savedOrigin) {
      storage.removeItem(savedOriginStorageKey);
      return null;
    }

    return savedOrigin;
  } catch {
    return null;
  }
}

export function saveSavedOrigin(
  origin: string,
  storage = getBrowserStorage()
): void {
  if (!storage) {
    return;
  }

  const normalizedOrigin = normalizeAirportCode(origin);
  if (!normalizedOrigin) {
    return;
  }

  try {
    storage.setItem(savedOriginStorageKey, normalizedOrigin);
  } catch {
    // Ignore persistence failures so the UI still works normally.
  }
}
