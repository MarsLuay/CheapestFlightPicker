# Quirks

- Browser catalog loading prefers bundled airport/airline CSVs, then falls back to the API.
- Saved preferences, dates, and origin live in browser local storage; no analytics or advertising SDK is shipped.
- Backtick or tilde opens the hidden admin panel with logs, origin diagnostics, timing guidance, price alerts, and Hacker Fare state.
- Origin selection prefers saved origin, then timezone inference, then `SEA`; the initial date mode is flexible unless exact dates are selected.
- Hosted mode blocks interactive search; offline mode can use catalogs/caches but cannot produce new live cheapest fares.
- When Google's internal Flights batchexecute endpoint returns HTTP 200 with gRPC 13, local Google page fallback reads priced `AF_initDataCallback` `ds:1` data. Round-trip fallback uses two directional page requests and labels the result `two_one_way_combo`.
- Root launchers can fetch the repository into a sibling directory and install missing Git/Node when supported by the host.
- The Windows launcher records startup, step, and captured command failures in `%TEMP%\CheapestFlightPicker-setup.log` and prints that path when setup stops.
- `src/server/index.ts` binds the HTTP port for normal `npm start` / `node dist/server/index.js`, and skips bind under Vitest or Vercel. An occupied `PORT` exits with a clear `EADDRINUSE` message on stderr (not a silent "Process completed" with no listen).

Code references for Serena: `workspace/app/web/src/App.tsx`, `workspace/app/web/src/lib/catalog.ts`, `workspace/app/src/shared`, and the root launcher scripts.
