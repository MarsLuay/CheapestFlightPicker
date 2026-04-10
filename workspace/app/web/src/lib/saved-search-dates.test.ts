import { describe, expect, it } from "vitest";

import {
  loadSavedSearchDates,
  saveSavedSearchDates
} from "./saved-search-dates";

function createMemoryStorage(initialValues?: Record<string, string>) {
  const values = new Map<string, string>(Object.entries(initialValues ?? {}));

  return {
    getItem(key: string) {
      return values.has(key) ? values.get(key) ?? null : null;
    },
    removeItem(key: string) {
      values.delete(key);
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    }
  };
}

describe("loadSavedSearchDates", () => {
  it("returns cached future dates when the saved range is still upcoming", () => {
    const storage = createMemoryStorage({
      "cheapest-flight-picker.saved-search-dates": JSON.stringify({
        departureDateFrom: "2026-05-23",
        departureDateTo: "2026-06-06",
        returnDateFrom: "2026-05-30",
        returnDateTo: "2026-06-13"
      })
    });

    expect(loadSavedSearchDates(storage, "2026-04-09")).toEqual({
      departureDateFrom: "2026-05-23",
      departureDateTo: "2026-06-06",
      returnDateFrom: "2026-05-30",
      returnDateTo: "2026-06-13"
    });
  });

  it("clears cached dates once any saved date falls into the past", () => {
    const storage = createMemoryStorage({
      "cheapest-flight-picker.saved-search-dates": JSON.stringify({
        departureDateFrom: "2026-04-08",
        departureDateTo: "2026-04-20",
        returnDateFrom: "2026-04-25",
        returnDateTo: "2026-04-30"
      })
    });

    expect(loadSavedSearchDates(storage, "2026-04-09")).toBeNull();
    expect(storage.getItem("cheapest-flight-picker.saved-search-dates")).toBeNull();
  });
});

describe("saveSavedSearchDates", () => {
  it("stores normalized future date selections", () => {
    const storage = createMemoryStorage();

    saveSavedSearchDates(
      {
        departureDateFrom: "2026-05-23",
        departureDateTo: "2026-06-06",
        returnDateFrom: "2026-05-30",
        returnDateTo: "2026-06-13"
      },
      storage,
      "2026-04-09"
    );

    expect(
      JSON.parse(storage.getItem("cheapest-flight-picker.saved-search-dates") ?? "")
    ).toEqual({
      departureDateFrom: "2026-05-23",
      departureDateTo: "2026-06-06",
      returnDateFrom: "2026-05-30",
      returnDateTo: "2026-06-13"
    });
  });
});
