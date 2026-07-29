# Functions — web

Source roots: `workspace/app/web/src/`

## API + bootstrap

| Symbol | File | Signature | Purpose | Side effects / errors |
| --- | --- | --- | --- | --- |
| (module) | `main.tsx` | — | Mount App | DOM |
| `App` | `App.tsx` | default component | Form + search orchestration | localStorage; abort; hosted gate |
| `runFlightSearch` | `lib/api.ts` | `(request, opts?) => Promise<SearchResponse>` | Force maxResults; job poll / hosted POST | Logs; timeouts; abort |
| `searchAirports` / `searchAirlines` / `fetchNearestAirport` | `lib/api.ts` | catalog helpers | Local catalog then API | `[]` / throw |
| `fetchServerLogs` / `clearServerLogs` / `checkApiHealth` | `lib/api.ts` | admin | Admin HTTP | Throws |
| `isHostedApiModeEnabled` | `lib/runtime-mode.ts` | `() => boolean` | Hosted detect | env + hostname |

## Cabin / links / prefs

| Symbol | File | Purpose |
| --- | --- | --- |
| `getCabinLabel` / `getNextCabinClass` / `buildAdjacentCabinSearchRequest` / `buildAdjacentCabinBoxTitle` | `lib/cabin-upgrade.ts` | Adjacent cabin follow-up |
| `buildGoogleFlightsSearchUrl*` / `buildGoogleFlightsSearchLinks*` / `buildGoogleFlightsTfsParam` | `lib/google-flights-link.ts` | Deep links (not scraper encoding) |
| `load/saveSavedSearchPreferences` / `load/saveSavedSearchDates` / `load/saveSavedOrigin` | prefs libs | Browser persistence |
| date helpers | `lib/date-input.ts`, `lib/request-dates.ts` | Window math / exact-date sync |
| `inferOriginFromTimeZone` / `getBrowserTimeZone` | `lib/timezone-origin.ts` | Coarse auto-origin |
| `searchCatalogAirports` / `searchCatalogAirlines` | `lib/catalog.ts` | Client CSV catalogs |
| `addClientLog` / `useClientLogs` / `attachGlobalClientLogHandlers` | `lib/admin-log.ts` | Client log ring + incidents |

## Components

| Symbol | File | Purpose |
| --- | --- | --- |
| `AirlinePicker` / `AirportField` / `TimeRangeSlider` | `components/*` | Form controls |
| `ResultsView` | `components/ResultsView.tsx` | Result cards + upgrade box |
| `AdminPanel` | `components/AdminPanel.tsx` | Advanced `` ` `` panel |
