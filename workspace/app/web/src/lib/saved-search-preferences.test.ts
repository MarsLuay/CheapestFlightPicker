import { describe, expect, it } from "vitest";

import {
  loadSavedSearchPreferences,
  saveSavedSearchPreferences
} from "./saved-search-preferences";

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

describe("loadSavedSearchPreferences", () => {
  it("returns normalized cached route, trip-length, and time-window values", () => {
    const storage = createMemoryStorage({
      "cheapest-flight-picker.saved-search-preferences": JSON.stringify({
        origin: " sea ",
        destination: " jfk ",
        useExactDates: true,
        minimumTripDays: 14,
        maximumTripDays: 7,
        departureTimeWindow: {
          from: 24,
          to: 6
        },
        arrivalTimeWindow: {
          from: 5.2,
          to: 21.7
        }
      })
    });

    expect(loadSavedSearchPreferences(storage)).toEqual({
      origin: "SEA",
      destination: "JFK",
      useExactDates: true,
      minimumTripDays: 7,
      maximumTripDays: 14,
      departureTimeWindow: {
        from: 6,
        to: 24
      },
      arrivalTimeWindow: {
        from: 5,
        to: 22
      }
    });
  });

  it("clears invalid cached values", () => {
    const storage = createMemoryStorage({
      "cheapest-flight-picker.saved-search-preferences": JSON.stringify({
        origin: "Seattle",
        destination: "JFK"
      })
    });

    expect(loadSavedSearchPreferences(storage)).toBeNull();
    expect(
      storage.getItem("cheapest-flight-picker.saved-search-preferences")
    ).toBeNull();
  });
});

describe("saveSavedSearchPreferences", () => {
  it("stores normalized cached preferences", () => {
    const storage = createMemoryStorage();

    saveSavedSearchPreferences(
      {
        origin: " sea ",
        destination: "",
        useExactDates: false,
        minimumTripDays: 4,
        maximumTripDays: 11,
        departureTimeWindow: {
          from: 18,
          to: 24
        },
        arrivalTimeWindow: {
          from: 7,
          to: 19
        }
      },
      storage
    );

    expect(
      JSON.parse(
        storage.getItem("cheapest-flight-picker.saved-search-preferences") ?? ""
      )
    ).toEqual({
      origin: "SEA",
      destination: "",
      useExactDates: false,
      minimumTripDays: 4,
      maximumTripDays: 11,
      departureTimeWindow: {
        from: 18,
        to: 24
      },
      arrivalTimeWindow: {
        from: 7,
        to: 19
      }
    });
  });
});
