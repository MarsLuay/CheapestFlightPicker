import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { JsonFileCache, stableSerialize } from "./cache";

const tempDirectories: string[] = [];

function createTempDirectory(): string {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "cheapest-flight-picker-cache-")
  );
  tempDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("stableSerialize", () => {
  it("sorts object keys consistently", () => {
    const left = stableSerialize({
      destination: "PIT",
      nested: { beta: 2, alpha: 1 },
      origin: "SEA"
    });
    const right = stableSerialize({
      origin: "SEA",
      nested: { alpha: 1, beta: 2 },
      destination: "PIT"
    });

    expect(left).toBe(right);
  });
});

describe("JsonFileCache", () => {
  it("returns a cached value before it expires", () => {
    const cache = new JsonFileCache<{ price: number }>({
      directoryPath: createTempDirectory(),
      ttlMs: 1000
    });

    cache.set({ route: "SEA-PIT" }, { price: 123 });

    expect(cache.get({ route: "SEA-PIT" })).toEqual({ price: 123 });
  });

  it("removes expired entries during a sweep", async () => {
    const directoryPath = createTempDirectory();
    const cache = new JsonFileCache<{ price: number }>({
      directoryPath,
      ttlMs: 10,
      sweepIntervalMs: 0
    });

    cache.set({ route: "SEA-PIT" }, { price: 123 });
    await new Promise((resolve) => setTimeout(resolve, 25));

    expect(cache.get({ route: "SEA-PIT" })).toBeNull();
    expect(fs.readdirSync(directoryPath).length).toBe(0);
  });

  it("prunes the oldest entries when the cache grows too large", () => {
    const directoryPath = createTempDirectory();
    const cache = new JsonFileCache<{ price: number }>({
      directoryPath,
      ttlMs: 1000,
      maxEntries: 2,
      sweepIntervalMs: 0
    });

    cache.set({ route: "SEA-PIT-1" }, { price: 101 });
    cache.set({ route: "SEA-PIT-2" }, { price: 102 });
    cache.set({ route: "SEA-PIT-3" }, { price: 103 });

    expect(cache.get({ route: "SEA-PIT-1" })).toBeNull();
    expect(cache.get({ route: "SEA-PIT-2" })).toEqual({ price: 102 });
    expect(cache.get({ route: "SEA-PIT-3" })).toEqual({ price: 103 });
    expect(fs.readdirSync(directoryPath).length).toBe(2);
  });

  it("keeps different cache versions isolated from each other", () => {
    const directoryPath = createTempDirectory();
    const v1Cache = new JsonFileCache<{ price: number }>({
      directoryPath,
      ttlMs: 1000,
      version: 1
    });
    const v2Cache = new JsonFileCache<{ price: number }>({
      directoryPath,
      ttlMs: 1000,
      version: 2
    });

    v1Cache.set({ route: "SEA-PIT" }, { price: 123 });

    expect(v1Cache.get({ route: "SEA-PIT" })).toEqual({ price: 123 });
    expect(v2Cache.get({ route: "SEA-PIT" })).toBeNull();
  });
});
