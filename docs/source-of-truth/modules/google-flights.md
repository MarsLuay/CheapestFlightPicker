# Module — google-flights

**Paths:** `workspace/app/src/providers/google-flights/`  
**Purpose:** Google Flights calendar + shopping HTTP adapter: encode, post (429 retry), parse, cache, map to `FlightOption` / `DatePrice`, post-filter carry-on / direct booking.  
**Public surface:** `GoogleFlightsProvider`, `createGoogleFlightsClient`, encode/parse helpers, provider param types  
**Depends on:** `core/cache`, `core/catalog`, `core/utils`, `core/fare-characteristics`, `shared` types, axios  
**Invariants:** Carry-on / direct-booking are **post-filters** (not in Google payload); RT follow-ups unbounded by candidate count; caches versioned  
**Related functions:** [functions/google-flights.md](../functions/google-flights.md)  
**Related types:** [types/google-flights.md](../types/google-flights.md)
