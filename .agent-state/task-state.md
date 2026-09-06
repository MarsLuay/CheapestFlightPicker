# Agent task state

schema_version: 2
trigger: milestone
timestamp: 2026-09-06T11:00:58+00:00
source_session_id: 01a075f0-5f37-7d92-a73e-0a9db859689d
active_subproject: .

## Task goal
Restore live Google Flights searches in CheapestFlightPicker so a real /api/search/jobs SEA-LAX run completes with priced results.

## Acceptance criteria
- Live local search returns inspectedOptions > 0 and non-null cheapestOverall.
- Google wire errors remain detected and are never cached as empty success.
- npm start stays alive with clear CORS and port behavior.
- npm test passes; durable findings update contract-listed memory only.

## Confirmed facts
- Current internal Google Flights POSTs return HTTP 200 with wrb.fr gRPC status 13 and null payload.
- A working Google Flights page returns live SEA-LAX priced results and embeds ds:1 data in AF_initDataCallback.
- A browser Network capture shows dynamic f.sid, bl, _reqid, session-token, X-Goog-BatchExecute-Bgr, X-Same-Domain, and x-goog-ext request context absent from the current direct client.
- The project has pre-existing uncommitted Google error/CORS/listen-gate changes that are in this run scope.

## Assumptions
- Use Google Flights page HTML as a local HTTP fallback if the unsigned internal RPC remains rejected.
- No live credentials or browser cookies are required for the public page fallback.

## Important files
- workspace/app/src/providers/google-flights/client.ts
- workspace/app/src/providers/google-flights/parsing.ts
- workspace/app/src/providers/google-flights/provider.ts
- workspace/app/src/core/search.ts
- workspace/app/src/server/index.ts
- docs/project-memory/known-failures.md
- docs/project-memory/quirks.md

## Important symbols
- GoogleFlightsClient.post
- GoogleFlightsProvider.searchDatePrices
- GoogleFlightsProvider.searchExactFlights
- parseExactSearchResponse
- FlightSearchService.search

## Decisions
- Test the existing HTTP RPC first, then add a Google-owned HTML fallback rather than silently accepting wire errors. — The live browser and public page prove Google can return priced data from this environment; preserving wire failure semantics prevents poisoned empty caches.

## Files changed
- None recorded.

## Verification performed
- npm run check
- npm test: 35 files and 271 tests passed after the fix
- completion gate: passed for CheapestFlightPicker and workspace/app
- npm run build
- live PORT=8788 /api/health with matching Origin
- live /api/search/jobs SEA-LAX round trip completed with inspectedOptions > 0 and priced cheapestOverall
- live default free-carry-on exact-date search completed with priced cheapestOverall
- occupied PORT=8788 exits with clear EADDRINUSE stderr
- git diff --check

## Baseline failures
- None recorded.

## Current failures
- None recorded.

## Unresolved risks
- Round-trip fallback intentionally reports separately priced directional fares as two_one_way_combo rather than claiming a single-ticket Google round trip.
- Flexible fallback uses the requested window start when Google's embedded page date graph has no dates inside the requested future window.

## Remaining steps
- None recorded.

## Raw artifact refs
- .agent-state/diagnostics/trace-error-google-flights.json

## Contract identity and route metadata
contract_id: cheapest-flight-picker-context-v1
contract_hash: a02b5577535d069f80457eacd9682b521610ecf2f94efd554fae169143cbab07
route_id: project-memory
context_packet_hash: 5589723d137f7a8afea36d81a202523bc4ed1e02513df32b1a89541d7eef1839
recovery_disposition: complete

## Next recommended action
Task complete; future work may improve flexible-date breadth of the HTML fallback.
