# Entrypoints

## Launchers (grandma path)

| Artifact | Role |
| --- | --- |
| `setup-and-launch.bat` | Windows double-click |
| `setup-and-launch.app` | macOS bundle |
| `setup-and-launch.desktop` + `setup-and-launch.sh` | Linux / terminal |

Bootstrap Git/Node, `npm install` under `workspace/app`, start server, open browser. Health-check reuse if already running.

## HTTP (Express)

Source: `workspace/app/src/server/index.ts`

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/api/health` | `{ ok: true }` |
| GET/DELETE | `/api/admin/logs` | In-memory server logs |
| POST | `/api/admin/incidents` | Persist client incident |
| GET | `/api/airports?query=` | Airport search |
| POST | `/api/airports/nearest` | Closest airport by lat/lon |
| GET | `/api/airlines?query=` | Airline search |
| POST | `/api/search` | Sync `FlightSearchService.search` |
| POST | `/api/search/jobs` | Async job (+ optional resume) → `{ jobId }` |
| GET | `/api/search/jobs/:id` | Job status / progress / summary |
| * | static + SPA | `public/` + `index.html` |

Package: `npm run dev:server` / `npm start` → listen unless `VERCEL`.

## React UI

| Entry | Path |
| --- | --- |
| `web/src/main.tsx` | Mount `<App />` |
| `web/src/App.tsx` | Form, search, multi-airport, cabin upgrade, hosted gate |
| `web/src/lib/api.ts` | `runFlightSearch` (forces `maxSearchResults`), catalog, logs |

Admin panel: toggle with `` ` `` / `~` (not primary product chrome).

## CLI

| Entry | Path |
| --- | --- |
| `npm run cli` / `src/cli/index.ts` | Commander → `FlightSearchService.search` |

Builds `SearchRequest` manually; core still validates with Zod on `search()`.
