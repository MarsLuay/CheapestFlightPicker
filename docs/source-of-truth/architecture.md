# Architecture

CheapestFlightPicker is a **local-first** flight search tool. Meat lives in `workspace/app`. Root launchers (`setup-and-launch.{bat,sh,app,desktop}`) bootstrap Node and start the local server + browser UI.

## System map

```text
setup-and-launch.*
        │
        ▼
┌───────────────────┐     ┌──────────────────────────────┐
│  Vite React UI    │────►│  Express server              │
│  web/src/App.tsx  │     │  src/server/index.ts         │
│  lib/api.ts       │     │  /api/search[/jobs]          │
└───────────────────┘     └──────────────┬───────────────┘
                                         │
                                         ▼
                          ┌──────────────────────────────┐
                          │  FlightSearchService         │
                          │  src/core/search.ts          │
                          └──────────────┬───────────────┘
                                         │
                    ┌────────────────────┼────────────────────┐
                    ▼                    ▼                    ▼
           GoogleFlightsProvider   TimingGuidance      BookingSourceSupplement
           providers/google-flights  (disk history)     (providers usually [])
                    │
                    ▼
           Google Flights HTTP (calendar + shopping)
           + JsonFileCache under runtime .cache/
```

CLI (`src/cli/index.ts`) calls `FlightSearchService` directly (no HTTP).

## Major data flows

### Round-trip search (cold cache)

1. Validate via `searchRequestSchema` (`src/shared/schemas.ts`).
2. Calendar graphs both directions (`searchOneWayWithinWindow` → `GetCalendarGraph`).
3. Annotate cheapest calendar dates with exact one-way timing (nested shopping calls).
4. Build scored date pairs (`buildCandidatePairs`); depth `max(maxResults*2, 8)`.
5. Per pair (concurrency 2): exact RT + OW outbound + OW inbound (`Promise.all`).
6. RT exact expands to **unbounded outbound follow-ups** (shopping per unique outbound).
7. Rank cheapest overall / RT / two-OW / nonstop / multi-stop; reprice winners with `bypassCache`.
8. Annotate timing guidance + price alert from local watch history.
9. Web may run a **second full search** for adjacent cabin upgrade.

### Local vs hosted

- Local launchers: full search works (Google from user machine).
- Hosted (`isHostedApiModeEnabled`): UI blocks interactive search; Google rate-limits shared IPs.

## Runtime data

Resolved by `resolveRuntimeDataPath` (`CHEAPEST_FLIGHT_PICKER_RUNTIME_DIR` / Vercel tmp / app dir):

- `.cache/google-flights/{calendar,exact}`
- `.cache/timing-guidance`, `.cache/timing-market-history`
- `logs/` incident JSON

Jobs live in an **in-memory Map** (`src/server/search-jobs.ts`) — not durable across restarts.
