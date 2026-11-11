import { AsyncLocalStorage } from "node:async_hooks";
import { performance } from "node:perf_hooks";

import type { SearchPerformanceMetrics } from "../shared/types";

type SearchPerformanceCollector = {
  startedAt: number;
  googleHttpAttempts: number;
  googleHttpMs: number;
  googleHttpActiveWallMs: number;
  activeGoogleRequests: number;
  activeGoogleRequestsStartedAt: number | null;
  responseParseCount: number;
  responseParseMs: number;
  cacheReads: number;
  cacheHits: number;
  cacheReadMs: number;
  cacheWrites: number;
  cacheWriteMs: number;
  rankingOperations: number;
  rankingMs: number;
};

const searchPerformanceStorage = new AsyncLocalStorage<SearchPerformanceCollector>();

function elapsedSince(startedAt: number): number {
  return Math.max(0, performance.now() - startedAt);
}

function roundMilliseconds(value: number): number {
  return Math.round(value * 10) / 10;
}

function addDuration(
  field: "responseParseMs" | "cacheReadMs" | "cacheWriteMs" | "rankingMs",
  startedAt: number
): void {
  const collector = searchPerformanceStorage.getStore();
  if (collector) {
    collector[field] += elapsedSince(startedAt);
  }
}

export async function collectSearchPerformance<T>(
  action: () => Promise<T>
): Promise<{ result: T; metrics: SearchPerformanceMetrics }> {
  const collector: SearchPerformanceCollector = {
    startedAt: performance.now(),
    googleHttpAttempts: 0,
    googleHttpMs: 0,
    googleHttpActiveWallMs: 0,
    activeGoogleRequests: 0,
    activeGoogleRequestsStartedAt: null,
    responseParseCount: 0,
    responseParseMs: 0,
    cacheReads: 0,
    cacheHits: 0,
    cacheReadMs: 0,
    cacheWrites: 0,
    cacheWriteMs: 0,
    rankingOperations: 0,
    rankingMs: 0
  };

  const result = await searchPerformanceStorage.run(collector, action);
  const metrics: SearchPerformanceMetrics = {
    elapsedMs: roundMilliseconds(elapsedSince(collector.startedAt)),
    googleHttpAttempts: collector.googleHttpAttempts,
    googleHttpMs: roundMilliseconds(collector.googleHttpMs),
    googleHttpActiveWallMs: roundMilliseconds(collector.googleHttpActiveWallMs),
    responseParseCount: collector.responseParseCount,
    responseParseMs: roundMilliseconds(collector.responseParseMs),
    cacheReads: collector.cacheReads,
    cacheHits: collector.cacheHits,
    cacheReadMs: roundMilliseconds(collector.cacheReadMs),
    cacheWrites: collector.cacheWrites,
    cacheWriteMs: roundMilliseconds(collector.cacheWriteMs),
    rankingOperations: collector.rankingOperations,
    rankingMs: roundMilliseconds(collector.rankingMs)
  };

  return { result, metrics };
}

export async function measureGoogleHttpRequest<T>(
  action: () => Promise<T>
): Promise<T> {
  const collector = searchPerformanceStorage.getStore();
  if (!collector) {
    return action();
  }

  const startedAt = performance.now();
  collector.googleHttpAttempts += 1;
  if (collector.activeGoogleRequests === 0) {
    collector.activeGoogleRequestsStartedAt = startedAt;
  }
  collector.activeGoogleRequests += 1;

  try {
    return await action();
  } finally {
    collector.googleHttpMs += elapsedSince(startedAt);
    collector.activeGoogleRequests = Math.max(
      0,
      collector.activeGoogleRequests - 1
    );
    if (collector.activeGoogleRequests === 0) {
      const activeStartedAt = collector.activeGoogleRequestsStartedAt;
      if (activeStartedAt !== null) {
        collector.googleHttpActiveWallMs += elapsedSince(activeStartedAt);
      }
      collector.activeGoogleRequestsStartedAt = null;
    }
  }
}

export function measureResponseParsing<T>(action: () => T): T {
  const collector = searchPerformanceStorage.getStore();
  if (!collector) {
    return action();
  }

  const startedAt = performance.now();
  collector.responseParseCount += 1;
  try {
    return action();
  } finally {
    addDuration("responseParseMs", startedAt);
  }
}

export async function measureCacheRead<T>(
  action: () => Promise<T | null>
): Promise<T | null> {
  const collector = searchPerformanceStorage.getStore();
  if (!collector) {
    return action();
  }

  const startedAt = performance.now();
  collector.cacheReads += 1;
  try {
    const result = await action();
    if (result !== null) {
      collector.cacheHits += 1;
    }
    return result;
  } finally {
    addDuration("cacheReadMs", startedAt);
  }
}

export async function measureCacheWrite<T>(
  action: () => Promise<T>
): Promise<T> {
  const collector = searchPerformanceStorage.getStore();
  if (!collector) {
    return action();
  }

  const startedAt = performance.now();
  collector.cacheWrites += 1;
  try {
    return await action();
  } finally {
    addDuration("cacheWriteMs", startedAt);
  }
}

export function measureSearchRanking<T>(action: () => T): T {
  const collector = searchPerformanceStorage.getStore();
  if (!collector) {
    return action();
  }

  const startedAt = performance.now();
  collector.rankingOperations += 1;
  try {
    return action();
  } finally {
    addDuration("rankingMs", startedAt);
  }
}
