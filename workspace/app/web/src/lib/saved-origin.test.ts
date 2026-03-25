import { describe, expect, it } from "vitest";

import { loadSavedOrigin, saveSavedOrigin } from "./saved-origin";

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

describe("loadSavedOrigin", () => {
  it("returns a normalized saved airport code", () => {
    const storage = createMemoryStorage({
      "cheapest-flight-picker.saved-origin": " jfk "
    });

    expect(loadSavedOrigin(storage)).toBe("JFK");
  });

  it("clears invalid saved values", () => {
    const storage = createMemoryStorage({
      "cheapest-flight-picker.saved-origin": "new york"
    });

    expect(loadSavedOrigin(storage)).toBeNull();
    expect(storage.getItem("cheapest-flight-picker.saved-origin")).toBeNull();
  });
});

describe("saveSavedOrigin", () => {
  it("stores a normalized airport code", () => {
    const storage = createMemoryStorage();

    saveSavedOrigin(" sea ", storage);

    expect(storage.getItem("cheapest-flight-picker.saved-origin")).toBe("SEA");
  });
});
