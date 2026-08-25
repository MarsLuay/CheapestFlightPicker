import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { JsonFileCache } from "../src/core/cache";

async function runBenchmark() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bench-cache-"));
  const cache = new JsonFileCache<unknown>({
    directoryPath: dir,
    ttlMs: 60000
  });

  const numEntries = 100;
  for (let i = 0; i < numEntries; i++) {
    await cache.set({ id: i }, { data: `test-payload-${i}` });
  }

  const iterations = 10000;

  // Measure get() throughput
  const startHits = performance.now();
  for (let i = 0; i < iterations; i++) {
    const key = { id: i % numEntries };
    await cache.get(key);
  }
  const endHits = performance.now();
  const timeHitsMs = endHits - startHits;
  const opsPerSecHits = (iterations / timeHitsMs) * 1000;

  console.log(`Cache Get (${iterations} ops): ${timeHitsMs.toFixed(2)} ms (${opsPerSecHits.toFixed(0)} ops/sec)`);

  fs.rmSync(dir, { recursive: true, force: true });
}

runBenchmark().catch(console.error);
