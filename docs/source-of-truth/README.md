# Source of truth — CheapestFlightPicker

**Code is authority.** This tree is derived from `workspace/app` production TypeScript. Regenerate with `/update-docs`.

**Target:** `.Projects/CheapestFlightPicker`  
**App root:** `workspace/app`  
**Last updated:** 2026-07-28

## How to read

| Page | Use |
| --- | --- |
| [architecture.md](architecture.md) | System map, data flows |
| [entrypoints.md](entrypoints.md) | CLI / HTTP / React / launchers |
| [cross-cutting.md](cross-cutting.md) | Cache, concurrency, errors, hosted mode |
| [conflicts.md](conflicts.md) | Open conflicts + duplicates |
| `modules/` | Module purpose + public surface |
| `functions/` | Function inventories |
| `types/` | Types / schemas |

## Coverage counts (approx)

| Layer | Modules / pages |
| --- | --- |
| Modules | 6 (`shared`, `core`, `server`, `cli`, `google-flights`, `web`) |
| Function pages | 6 (same ids) |
| Type pages | 4 (`shared`, `google-flights`, `core`, `web`) |

## Skipped trees

| Path | Reason |
| --- | --- |
| `node_modules/`, `dist/`, build caches | Generated / deps |
| `data/*.csv` | Large static catalogs; loaded by `catalog.ts` / `web/src/lib/catalog.ts` |
| `*.test.ts` | Tests; not runtime surface |
| Root launchers (`setup-and-launch.*`) | Documented in [entrypoints.md](entrypoints.md); shell not TS inventory |
| Nested `.git` under project if present | VCS |

## Index

### Modules

- [modules/shared.md](modules/shared.md)
- [modules/core.md](modules/core.md)
- [modules/server.md](modules/server.md)
- [modules/cli.md](modules/cli.md)
- [modules/google-flights.md](modules/google-flights.md)
- [modules/web.md](modules/web.md)

### Functions

- [functions/shared.md](functions/shared.md)
- [functions/core.md](functions/core.md)
- [functions/server.md](functions/server.md)
- [functions/cli.md](functions/cli.md)
- [functions/google-flights.md](functions/google-flights.md)
- [functions/web.md](functions/web.md)

### Types

- [types/shared.md](types/shared.md)
- [types/core.md](types/core.md)
- [types/google-flights.md](types/google-flights.md)
- [types/web.md](types/web.md)
