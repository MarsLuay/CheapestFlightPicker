# Functions — core

Source roots: `workspace/app/src/core/`

## search.ts

| Symbol | File | Signature | Purpose | Side effects / errors |
| --- | --- | --- | --- | --- |
| `FlightSearchService.search` | `search.ts` | `(input, progress?, options?) => Promise<SearchSummary>` | Full OW/RT orchestration | Zod; catalog Errors; provider I/O; progress/checkpoint callbacks |
| `refineOptionsForDirectBookingPreference` | `search.ts` | private | Supplement + filter likely-direct | Supplement I/O if wired |
| `repriceOption` / `repriceOneWayOption` | `search.ts` | private | Recheck the selected exact itinerary through the provider's normal cache path | Provider I/O |
| `searchOneWay` / `searchRoundTrip` | `search.ts` | private | Date scan → exacts → rank | Concurrency 2; checkpoints |
| `buildCandidatePairs` | `search.ts` | private | Score/cut date pairs | Pure |
| `ensureReferenceDataExists` | `search.ts` | private | Unknown IATA/airline guard | Throws |

## Other core

| Symbol | File | Signature | Purpose | Side effects / errors |
| --- | --- | --- | --- | --- |
| `createFlightSearchProvider` | `search-provider.ts` | `() => FlightSearchProvider` | `GoogleFlightsProvider` factory | Constructs provider |
| `buildWatchKey` / `buildPriceAlert` / `buildHackerFareInsight` / `buildTimingGuidance` | `timing-guidance.ts` | various | Pure timing/alert/hacker helpers | Pure |
| `TimingGuidanceService.annotateSummary` | `timing-guidance.ts` | `(summary, …) => Promise<SearchSummary>` | Persist observation + annotate | Disk cache writes |
| `needsBookingSourceSupplement` / `getBookingSourceSupplementReasons` | `booking-source-supplement.ts` | various | Gate enrichment | Env airline allowlist |
| `BookingSourceSupplementService.supplementOptions` / `supplementSummary` | `booking-source-supplement.ts` | async | Enrich booking sources | Provider I/O if non-empty |
| `findAirportByCode` / `findClosestAirport` / `findAirlineByCode` / `searchAirports` / `searchAirlines` | `catalog.ts` | various | CSV catalog access | Lazy `readFileSync` |
| `calculateFlightDistanceMiles` | `catalog.ts` | `(legs) => number` | Sum stored or great-circle leg miles | Lazy catalog reads when leg miles are absent |
| `stableSerialize` | `cache.ts` | `(value) => string` | Deterministic JSON | Pure |
| `JsonFileCache.get/set/sweepExpired` | `cache.ts` | class | SHA256 file cache | Sync FS |
| `combineBookingSources` / `prefersDirectBooking` / `isLikelyDirectAirlineBookingOption` / `clampTimeWindow` / `combineTwoOneWays` / `getFlightMiles` / `compareFlightOptions` / `findCheapest*` / `mapWithConcurrency` / Google enum maps | `utils.ts` | various | Shared helpers, including optional mileage tie-breaking after price | Pure / concurrent async |
| `getOptionAirlineCodes` / `isNonstopOption` / `optionAppearsToIncludeFreeCarryOnBag` | `fare-characteristics.ts` | various | Fare heuristics | Pure |
| `resolveAppPath` / `resolveRuntimeDataPath` | `project-paths.ts` | `(...segs) => string` | Paths | Env |
| `sleep` | `sleep.ts` | `(ms, signal?) => Promise<void>` | Abortable delay | AbortError |
