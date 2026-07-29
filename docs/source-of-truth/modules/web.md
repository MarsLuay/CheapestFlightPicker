# Module — web

**Paths:** `workspace/app/web/src/`  
**Purpose:** React UI for flexible flight search, results, Google Flights deep links, hidden admin, local prefs.  
**Public surface:** `App`, components, `runFlightSearch`, catalog/date/prefs helpers, `maxSearchResults` re-export  
**Depends on:** shared types (via `lib/types`), Vite, React 19  
**Invariants:** Hosted mode blocks search; every `runFlightSearch` forces `maxResults = maxSearchResults`; admin is `` ` ``-gated Advanced surface  
**Related functions:** [functions/web.md](../functions/web.md)  
**Related types:** [types/web.md](../types/web.md)
