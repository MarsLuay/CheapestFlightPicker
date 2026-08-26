import { performance } from "node:perf_hooks";
import { findAirportByCode } from "./catalog";

const testCodes = [
  "SEA", "JFK", "LAX", "LHR", "CDG", "SFO", "ORD", "HND", "SYD", "DXB",
  "FRA", "AMS", "SIN", "HKG", "ICN", "BKK", "DEN", "ATL", "DFW", "UNKNOWN"
];

// Warmup
for (let i = 0; i < 1000; i++) {
  findAirportByCode(testCodes[i % testCodes.length]!);
}

const ITERATIONS = 100000;
const start = performance.now();

for (let i = 0; i < ITERATIONS; i++) {
  findAirportByCode(testCodes[i % testCodes.length]!);
}

const end = performance.now();
const durationMs = end - start;
const opsPerSec = Math.round((ITERATIONS / durationMs) * 1000);

console.log(`Execution time for ${ITERATIONS} lookups: ${durationMs.toFixed(2)} ms`);
console.log(`Operations per second: ${opsPerSec.toLocaleString()} ops/sec`);
