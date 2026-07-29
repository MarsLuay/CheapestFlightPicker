# Functions — google-flights

Source roots: `workspace/app/src/providers/google-flights/`

| Symbol | File | Signature | Purpose | Side effects / errors |
| --- | --- | --- | --- | --- |
| `encodeCalendarSearch` / `encodeExactSearch` | `encoding.ts` | `(params) => string` | URI-encoded `f.req` payloads | Pure; ignores carry-on/direct flags |
| `parseCalendarResponse` / `parseExactSearchResponse` | `parsing.ts` | `(input) => …` | Parse Google envelopes | Throws invalid JSON |
| `GoogleFlightsClient.post` | `client.ts` | `(url, data, signal?) => Promise<string>` | POST + 429 retry | `GoogleFlightsRateLimitError`; AbortSignal |
| `createGoogleFlightsClient` | `client.ts` | `() => GoogleFlightsClient` | Factory | — |
| `GoogleFlightsProvider.searchDatePrices` | `provider.ts` | `(params) => Promise<DatePrice[]>` | Calendar + timing annotate | Cache + HTTP |
| `GoogleFlightsProvider.searchExactFlights` | `provider.ts` | `(params, {bypassCache?}?) => Promise<FlightOption[]>` | OW/RT exact (+ unbounded RT follow-ups) | Cache + HTTP + filters |
| `GoogleFlightsProvider.searchOneWayWithinWindow` | `provider.ts` | `(request, o, d, from, to) => Promise<DatePrice[]>` | Calendar wrapper for core | Forwards `requireFreeCarryOnBag` into `searchDatePrices` (C001 fixed) |
| `getRoundTripOutboundCandidates` | `provider.ts` | private | Dedupe/sort outbounds | No count cap |
| `annotateDatePricesWithExactTimes` | `provider.ts` | private | Exact times for top-12 dates | Nested exacts |
| `applyDirectBookingPreference` / `applyFreeCarryOnRequirement` | `provider.ts` | private | Post-filters | — |
