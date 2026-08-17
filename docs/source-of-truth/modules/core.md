# Module — core

**Paths:** `workspace/app/src/core/`  
**Purpose:** Search orchestration, catalog, cache, timing guidance, fare heuristics, concurrency helpers.  
**Public surface:** `FlightSearchService`, `createFlightSearchProvider`, `FlightSearchProvider`, catalog finders, `JsonFileCache`, `stableSerialize`, timing builders/service, booking-source supplement types/service, utils cheapest/concurrency helpers, fare-characteristics, path/sleep helpers  
**Depends on:** `shared`, `providers/google-flights` (via factory), Node FS  
**Invariants:** `search()` always runs `searchRequestSchema`; lower price always outranks mileage, and `prioritizeMileFlights` breaks only exact price ties using total estimated leg miles; resume checkpoints match via `stableSerialize(request)`; production supplement has empty providers (no-op)

**Related functions:** [functions/core.md](../functions/core.md)  
**Related types:** [types/core.md](../types/core.md)
