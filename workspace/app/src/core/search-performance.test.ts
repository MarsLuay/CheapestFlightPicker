import { describe, expect, it } from "vitest";

import {
  collectSearchPerformance,
  measureCacheRead,
  measureCacheWrite,
  measureGoogleHttpRequest,
  measureResponseParsing,
  measureSearchRanking
} from "./search-performance";

describe("search performance measurements", () => {
  it("records scoped HTTP, parsing, cache, ranking, and total timings", async () => {
    const { result, metrics } = await collectSearchPerformance(async () => {
      const parsed = measureResponseParsing(() => ({ flights: 2 }));
      const cached = await measureCacheRead(async () => parsed);
      await measureCacheRead(async () => null);
      await measureCacheWrite(async () => undefined);
      const ranked = measureSearchRanking(() => [3, 1, 2].sort());
      const response = await measureGoogleHttpRequest(async () => 200);

      return { cached, ranked, response };
    });

    expect(result).toEqual({
      cached: { flights: 2 },
      ranked: [1, 2, 3],
      response: 200
    });
    expect(metrics.elapsedMs).toBeGreaterThanOrEqual(0);
    expect(metrics.googleHttpAttempts).toBe(1);
    expect(metrics.googleHttpMs).toBeGreaterThanOrEqual(0);
    expect(metrics.googleHttpActiveWallMs).toBeGreaterThanOrEqual(0);
    expect(metrics.responseParseCount).toBe(1);
    expect(metrics.responseParseMs).toBeGreaterThanOrEqual(0);
    expect(metrics.cacheReads).toBe(2);
    expect(metrics.cacheHits).toBe(1);
    expect(metrics.cacheReadMs).toBeGreaterThanOrEqual(0);
    expect(metrics.cacheWrites).toBe(1);
    expect(metrics.cacheWriteMs).toBeGreaterThanOrEqual(0);
    expect(metrics.rankingOperations).toBe(1);
    expect(metrics.rankingMs).toBeGreaterThanOrEqual(0);
  });

  it("keeps concurrent searches' measurements isolated", async () => {
    const results = await Promise.all(
      Array.from({ length: 2 }, () =>
        collectSearchPerformance(async () => {
          await Promise.resolve();
          await measureGoogleHttpRequest(async () => "ok");
          return "done";
        })
      )
    );

    expect(results.map(({ metrics }) => metrics.googleHttpAttempts)).toEqual([
      1,
      1
    ]);
  });
});
