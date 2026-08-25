# Architecture

- The repository root is a thin launcher/documentation shell. The app lives in `workspace/app`.
- `workspace/app` is one strict TypeScript package. `src/core` contains search/comparison logic, `src/providers/google-flights` handles the Google Flights request/parsing layer, `src/server` exposes the local API, `src/cli` exposes the command-line entrypoint, `src/shared` holds shared types/schemas, and `web/src` contains the React UI.
- `src/server/index.ts` builds the Express server on port `8787` by default. It serves health, admin diagnostics, airport/airline catalog, search, and resumable search-job endpoints, then serves the built web assets.
- `src/cli/index.ts` uses the same `FlightSearchService` as the server and prints cheapest-result buckets plus price-alert, Hacker Fare, and timing-guidance summaries.
- `web/src/main.tsx` mounts `App` under React `StrictMode`. Vite uses `web` as its root, writes production assets to `public`, and proxies `/api` to `localhost:8787` during development.
- The package build uses `tsup` for `src/server/index.ts` and `src/cli/index.ts` under `dist`; `vitest` runs tests under both `src` and `web/src`.

Sources: `README.md`, `workspace/app/README.md`, `workspace/app/package.json`, `workspace/app/tsconfig.json`, `workspace/app/vite.config.ts`, `workspace/app/tsup.config.ts`, `workspace/app/vitest.config.ts`, and the listed entrypoints.
