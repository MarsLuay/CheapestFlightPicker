# Functions — cli

Source roots: `workspace/app/src/cli/`

| Symbol | File | Signature | Purpose | Side effects / errors |
| --- | --- | --- | --- | --- |
| `parseAirlines` | `index.ts` | `(value) => string[]` | CSV airline codes | Pure |
| `printOption` / `printTimingGuidance` / `printPriceAlert` / `printHackerFareInsight` | `index.ts` | printers | stdout summary | Console |
| `program.action` | `index.ts` | async | Build request → search → print | `exitCode=1` on error |
