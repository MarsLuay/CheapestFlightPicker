# Open conflicts and duplicates

Last updated: 2026-07-28

| ID | Kind | Severity | Symbols / paths | Evidence | Canonical owner (proposed) | Status |
| --- | --- | --- | --- | --- | --- | --- |
| C001 | conflict | block | `GoogleFlightsProvider.searchOneWayWithinWindow` vs exact search path | Calendar wrapper omitted `requireFreeCarryOnBag` | Forward flag into `searchDatePrices` | fixed |
| D001 | dupe | warn | `fare-characteristics` vs private helpers in `booking-source-supplement.ts` | Same airline-code / nonstop logic | Import `fare-characteristics` | open |
| D002 | dupe | warn | `utils.findCheapestNonstop` vs `isNonstopOption` | Parallel nonstop predicate | Call `isNonstopOption` | open |
| D003 | dupe | warn | `dayMs` in `schemas.ts`, `search.ts`, `timing-guidance.ts` | Triplicated constant | Shared const | open |
| D004 | dupe | warn | `normalizeTimeWindow` in web libs vs `clampTimeWindow` | Same rules | Reuse helper | open |
| D005 | dupe | warn | `saved-origin.ts` private `getBrowserStorage` | Reimplements browser-storage | Import shared | open |
| D006 | seam | warn | `BookingSourceSupplementService` empty providers in production | Always early-return | Optional adapter seam | accepted-dual |
| D007 | product | warn | Cabin upgrade full second search | Doubled Google load | Slim to maxResults=3 via api override | fixed |
| D008 | product | warn | Unbounded RT outbound follow-ups | No `.slice` on candidates | Cap top-5 | fixed |

Status: `open` | `fixing` | `fixed` | `accepted-dual`
