# Functions — google-flights

Source roots: `workspace/app/src/providers/google-flights/`

| Symbol | File | Signature | Purpose | Side effects / errors |
| --- | --- | --- | --- | --- |
| `encodeCalendarSearch` / `encodeExactSearch` | `encoding.ts` | `(params) => string` | URI-encoded `f.req` payloads | Pure; ignores carry-on/direct flags |
| `parseCalendarResponse` / `parseExactSearchResponse` | `parsing.ts` | `(input) => …` | Parse Google envelopes | Throws invalid JSON |
| `GoogleFlightsClient.post` | `client.ts` | `(url, data, signal?) => Promise<string>` | POST + 429 retry | `GoogleFlightsRateLimitError`; AbortSignal |
| `createGoogleFlightsClient` | `client.ts` | `() => GoogleFlightsClient` | Factory | — |
| `GoogleFlightsProvider.searchDatePrices` | `provider.ts` | `(params) => Promise<DatePrice[]>` | Calendar + timing annotate | Cache + HTTP |
| `GoogleFlightsProvider.searchExactFlights` | `provider.ts` | `(params, {bypassCache?}?) => Promise<FlightOption[]>` | OW/RT exact; RT follows up on at most five unique outbounds | Cache + HTTP + filters |
| `GoogleFlightsProvider.searchOneWayWithinWindow` | `provider.ts` | `(request, o, d, from, to) => Promise<DatePrice[]>` | Calendar wrapper for core | Forwards `requireFreeCarryOnBag` into `searchDatePrices` (C001 fixed) |
| `getRoundTripOutboundCandidates` | `provider.ts` | private | Dedupe/sort outbounds, optionally breaking price ties by miles | Five-candidate cap |
| `toSlice` | `provider.ts` | private | Map provider legs and estimate each leg's great-circle miles | Catalog lookups |
| `applyDirectBookingPreference` / `applyFreeCarryOnRequirement` | `provider.ts` | private | Post-filters | — |
