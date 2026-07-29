# Module — shared

**Paths:** `workspace/app/src/shared/`  
**Purpose:** Domain types + Zod validation for search requests. No I/O.  
**Public surface:** `maxSearchResults`, cabin/stops/trip enums + types, `searchRequestSchema`  
**Depends on:** `zod`  
**Invariants:** Origin ≠ destination; lap infants ≤ adults; total passengers ≤ 9; ISO dates; `maxResults` 1–20  
**Related functions:** [functions/shared.md](../functions/shared.md)  
**Related types:** [types/shared.md](../types/shared.md)
