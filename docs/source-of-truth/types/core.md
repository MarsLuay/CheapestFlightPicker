# Types — core

Significant internal types (not all exported):

| Symbol | File | Notes |
| --- | --- | --- |
| `FlightSearchProvider` / `SearchProviderRuntimeOptions` | `search-provider.ts` | Provider seam |
| `CandidatePair` / `ScoredCandidatePair` / `ProgressTracker` | `search.ts` | Pair evaluation |
| `TimingObservation` / related private metrics | `timing-guidance.ts` | Watch history |
| `BookingSourceSupplementProvider` / `BookingSourceSupplementReason` | `booking-source-supplement.ts` | Optional enrichment seam |
| `JsonFileCache` options | `cache.ts` | TTL, maxEntries, version |
