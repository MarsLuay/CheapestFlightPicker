# Decisions

- Local execution is the supported Google Flights path; hosted interactive searches are intentionally constrained because shared hosted IPs are rate-limited.
- The UI is English-only by design. No locale-file system is maintained.
- Server and CLI share `FlightSearchService`; no parallel search/comparison authority.
- Development keeps Vite `5173` and Express `8787` separate. Production keeps server/CLI bundles in `dist` and Vite output in `public`.
- Durable agent knowledge belongs in the memory bank. Current implementation detail belongs to Serena; do not recreate generated source-of-truth inventories.
- Admin endpoints fail closed: `/api/admin/*` requires a configured `ADMIN_API_KEY`, `ADMIN_KEY`, `ADMIN_TOKEN`, or `ADMIN_SECRET`; browser admin requests use the runtime `window.__ADMIN_TOKEN__` value as `x-admin-key` when supplied.

Code references for Serena: `workspace/app/package.json`, `workspace/app/vite.config.ts`, `workspace/app/tsup.config.ts`, `workspace/app/src/server/index.ts`, and `workspace/app/src/cli/index.ts`.
