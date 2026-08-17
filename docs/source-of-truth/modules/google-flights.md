# Module — google-flights

**Paths:** `workspace/app/src/providers/google-flights/`  
**Purpose:** Google Flights calendar + shopping HTTP adapter: encode, post (429 retry), parse, cache, map to `FlightOption` / `DatePrice` with estimated leg miles, post-filter carry-on / direct booking.

**Public surface:** `GoogleFlightsProvider`, `createGoogleFlightsClient`, encode/parse helpers, provider param types  
**Depends on:** `core/cache`, `core/catalog`, `core/utils`, `core/fare-characteristics`, `shared` types, axios  
**Invariants:** Carry-on / direct-booking and mileage preference are not encoded in the Google payload; RT follow-ups are capped at five unique outbounds, with mileage used only to order equal-price candidates when enabled; caches are versioned

**Related functions:** [functions/google-flights.md](../functions/google-flights.md)  
**Related types:** [types/google-flights.md](../types/google-flights.md)
