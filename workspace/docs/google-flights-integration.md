# Google Flights Integration Notes

## Fragility Warning

This app's Google Flights integration depends on undocumented internal Google
Flights endpoints and payload formats.

Two important consequences follow from that:

1. The request shape is not guaranteed to stay stable.
2. The response shape is not guaranteed to stay stable.

If Google changes either one, the Google Flights integration can break without
warning.

## First Places To Check

The first files to inspect when the integration starts failing are:

- `workspace/app/src/providers/google-flights/encoding.ts`
- `workspace/app/src/providers/google-flights/parsing.ts`

### `encoding.ts`

This file builds the request payloads sent to Google Flights internal endpoints.
If Google changes expected request structure, segment encoding, field ordering,
or accepted values, requests may stop returning useful data.

### `parsing.ts`

This file parses Google Flights responses using array-index access into nested
payload structures. That is intentionally pragmatic, but it is also the most
fragile part of the integration. If Google shifts bucket positions, nesting, or
field meanings, parsing can silently return incomplete or incorrect results.

## Why This Is Risky

The integration does not use a published, versioned Google Flights API.
Instead, it relies on:

- internal endpoint URLs
- encoded request payloads
- nested array payloads
- array-index parsing instead of stable named fields

Because of that, even a small upstream payload change can cause:

- empty date-price results
- empty exact-flight results
- incorrect pricing
- incorrect booking-source detection
- missing or malformed flight legs

## Operational Guidance

When search behavior suddenly degrades, check these in order:

1. `workspace/app/src/providers/google-flights/client.ts`
2. `workspace/app/src/providers/google-flights/encoding.ts`
3. `workspace/app/src/providers/google-flights/parsing.ts`
4. `workspace/app/src/providers/google-flights/provider.ts`

Typical symptoms of an upstream Google change:

- calendar searches return no candidates
- exact-flight searches return no options
- round-trip stitching stops working
- booking-source labels become mostly `unknown`
- search tests around provider parsing start failing

## Summary

This integration is intentionally useful, but it is not stable by contract.
If Google changes payload shape, `parsing.ts` and `encoding.ts` are the first
places that will break and the first places to investigate.
