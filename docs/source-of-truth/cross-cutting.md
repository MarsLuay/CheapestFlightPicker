# Cross-cutting

## Config / constants

| Concern | Location | Notes |
| --- | --- | --- |
| `maxSearchResults = 12` | `src/shared/types.ts` | Web `runFlightSearch` always forces this |
| Schema `maxResults` | `src/shared/schemas.ts` | int 1–20, default `maxSearchResults` |
| `requireFreeCarryOnBag` | schema default **true** | Post-filter in provider (not encoded to Google) |
| `prioritizeMileFlights` | schema default **false** | Equal-price tie-break only; sums estimated great-circle miles across every leg |
| Carry-on denylist | `src/core/fare-characteristics.ts` | Economy ULCC heuristic |

## Persistence

| Store | Mechanism | TTL / limits |
| --- | --- | --- |
| Exact / calendar Google cache | `JsonFileCache` sync FS | 20m / 30m; max 800 / 300; versioned keys |
| Timing watch history | `JsonFileCache` | ~180d |
| Search jobs | In-memory Map | Prune ~30m |
| Server logs | Ring buffer 200 | Optional incident disk |
| Browser prefs / dates / origin | `localStorage` | Keys under `cheapest-flight-picker.*` |

## Concurrency

| Layer | Cap |
| --- | --- |
| OW date exacts / RT pairs | `mapWithConcurrency(..., 2)` |
| RT outbound follow-ups | concurrency 2, top 5 unique outbounds |
| Booking supplement | concurrency 2 (providers usually empty) |
| Global Google HTTP posts | semaphore cap 3 |

Client 429: max 2 retries, ~800ms × attempt. AbortSignal is propagated from the active search context into Google HTTP posts.

## Errors

| Source | Mapping |
| --- | --- |
| Zod | 400 via search failure helper |
| `GoogleFlightsRateLimitError` | HTTP 429 + resume UX |
| Network | 503 |
| Hosted UI | Client blocks before API |

## Hosted vs local

- Local: Google from user IP; full pipeline.
- Hosted: `isHostedApiModeEnabled()` → App shows static “won't work on website” message.
- Offline after install: catalogs + caches local; **live cheapest search needs Google**. Honest offline = last cache / no new search, not fake live prices.

## Progress / polling

- Job poll every **350ms** with full `previewSummary` + checkpoint payload.
- Admin panel polls health/logs every **3s** while open.
