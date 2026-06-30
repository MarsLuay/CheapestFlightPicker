export type StorageLike = Pick<Storage, "getItem" | "removeItem" | "setItem">;

export function getBrowserStorage(): StorageLike | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function persistJsonToStorage(
  storage: StorageLike | null,
  key: string,
  value: unknown
): void {
  if (!storage) {
    return;
  }

  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore persistence failures so the UI still works normally.
  }
}
