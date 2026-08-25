# Decisions

- Local execution is the supported path for Google Flights lookups; the hosted path is intentionally constrained because Google rate-limits hosted traffic.
- The UI is English-only by design; no locale-file system is present.
- The server and CLI share the core `FlightSearchService` so both interfaces use the same search/comparison behavior.
- Development keeps the UI and API separate: Vite serves the web app on port `5173` and proxies `/api` to the local Express server at `localhost:8787`.
- The production build keeps server and CLI bundles in `dist` and Vite output in `public`, matching the launcher/server layout.
- Admin endpoints fail closed: `/api/admin/*` requires a configured `ADMIN_API_KEY`, `ADMIN_KEY`, `ADMIN_TOKEN`, or `ADMIN_SECRET`; browser admin requests use the runtime `window.__ADMIN_TOKEN__` value as `x-admin-key` when supplied.

Sources: `README.md`, `workspace/app/README.md`, `workspace/app/package.json`, `workspace/app/vite.config.ts`, and `workspace/app/tsup.config.ts`.
