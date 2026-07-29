# Types — shared

Source: `workspace/app/src/shared/types.ts`, `schemas.ts`

| Symbol | Kind | Notes |
| --- | --- | --- |
| `maxSearchResults` | const `12` | Web forces this on every search |
| `CabinClass` / `StopsFilter` / `TripType` | unions | From const arrays |
| `SearchRequest` | type | Full search input incl. `maxResults`, carry-on, time windows |
| `PassengerCounts` / `TimeWindow` / `BookingSource` | types | Nested request/result |
| `FlightLeg` / `FlightSlice` / `FlightOption` / `DatePrice` | types | Itinerary + calendar prices |
| `AirportRecord` / `AirlineRecord` | types | Catalog rows |
| `SearchSummary` / `SearchProgress*` / `SearchResumeCheckpoint` / `SearchJobStatus` / `SearchResponse` | types | Results + jobs |
| `TimingGuidance` / `PriceAlert` / `HackerFareInsight` | types | Post-search annotations |
| `searchRequestSchema` | Zod | Authority for HTTP/core validation |
