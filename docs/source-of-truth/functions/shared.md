# Functions — shared

Source roots: `workspace/app/src/shared/`

| Symbol | File | Signature | Purpose | Side effects / errors |
| --- | --- | --- | --- | --- |
| `searchRequestSchema` | `schemas.ts` | Zod object | Validate/normalize `SearchRequest` | Zod issues; uppercases codes; defaults passengers/`maxResults`/carry-on |
| *(consts)* | `types.ts` | — | `maxSearchResults`, enum arrays | None |
