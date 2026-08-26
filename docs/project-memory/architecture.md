# Architecture

- Local-first flight search. Root launchers bootstrap Git/Node, install `workspace/app`, start the local server, and open the browser UI.
- `workspace/app` is one strict TypeScript package: `src/core` owns comparison logic; `src/providers/google-flights` owns Google request/parsing; `src/server` owns Express/API; `src/cli` owns CLI; `src/shared` owns schemas/types; `web/src` owns React UI.
- The UI runs from Vite on `5173` and proxies `/api` to Express on `8787`. The server serves health, admin diagnostics, catalogs, sync search, resumable search jobs, and built web assets. The CLI calls the same `FlightSearchService` directly.
- Search validates the request, explores calendar windows, reprices exact candidates, ranks overall/round-trip/two-one-way/nonstop/stops buckets, then annotates timing guidance and price alerts.
- Runtime data uses local JSON caches for Google fares and timing history plus incident logs. Search jobs are an in-memory `Map`; browser preferences, dates, and origin use local storage.
- Serena is the current-code authority for all deeper module, symbol, reference, and implementation detail.

Code references for Serena: `workspace/app/package.json`, `workspace/app/tsconfig.json`, `workspace/app/vite.config.ts`, `workspace/app/tsup.config.ts`, `workspace/app/vitest.config.ts`, and the entrypoints under `workspace/app/src` and `workspace/app/web/src`.
