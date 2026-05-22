# Cheapest Flight Picker Guide

This guide is meant for normal humans first.

If you are not a programmer, start with the feature guide.
If you are trying to find where something lives in the code, use the file guide.

The app has one main job:

Find cheap flight options across a range of dates, explain what looks best, and show the results in a way that is easier to compare than searching day by day by hand.

## How The App Works In Plain English

1. You choose an origin, destination, dates, and a few filters.
2. The web app sends that search to the local server.
3. The server asks Google Flights for calendar prices and exact fares.
4. The app compares the options.
5. The results screen highlights the cheapest picks, date trends, timing hints, and booking details.

## Feature Guide

### 1. Main Search Form

What it does:
Lets the user choose where they are flying from, where they want to go, when they want to travel, and what kind of fares they care about.

Why it matters:
This is the control center for the whole app.

Main files:

| File | What it does |
| --- | --- |
| `workspace/app/web/src/App.tsx` | The main page. Holds most of the form, screen state, search behavior, and UI rules. |
| `workspace/app/web/src/styles.css` | Visual styling for the page. |
| `workspace/app/web/src/main.tsx` | Starts the React app in the browser. |

### 2. Airport And Airline Pickers

What it does:
Helps the user search for airport codes and airline names without needing to memorize them.

Why it matters:
Most people do not know airport codes beyond a few big ones.

Main files:

| File | What it does |
| --- | --- |
| `workspace/app/web/src/components/AirportField.tsx` | Input field that helps the user search and select airports. |
| `workspace/app/web/src/components/AirlinePicker.tsx` | UI for choosing preferred or allowed airlines. |
| `workspace/app/web/src/lib/api.ts` | Browser-side calls that ask the server for airports and airlines. |
| `workspace/app/src/server/index.ts` | Server routes that return airport and airline search results. |
| `workspace/app/src/core/catalog.ts` | Looks up airports and airlines from local data files. |
| `workspace/app/data/airports.csv` | Airport reference list. |
| `workspace/app/data/airlines.csv` | Airline reference list. |

### 3. Smart Origin Detection

What it does:
Tries to guess a useful default origin airport based on saved settings or the browser time zone.

Why it matters:
It saves the user from re-entering the same home airport every time.

Main files:

| File | What it does |
| --- | --- |
| `workspace/app/web/src/lib/timezone-origin.ts` | Turns a browser time zone into a rough airport suggestion. |
| `workspace/app/web/src/lib/saved-origin.ts` | Saves and reloads the user's chosen origin. |
| `workspace/app/web/src/App.tsx` | Decides whether to use saved origin, inferred origin, or the fallback default. |

### 4. Flexible Dates And Exact Dates

What it does:
Lets the user search either:

- a date range, where the app looks for the cheapest combination
- exact dates, where the app checks one specific trip

Why it matters:
Flexible date searching is one of the biggest ways to find cheaper fares.

Main files:

| File | What it does |
| --- | --- |
| `workspace/app/web/src/lib/date-input.ts` | Date helpers used by the form. |
| `workspace/app/web/src/lib/request-dates.ts` | Keeps date rules valid when the user changes fields. |
| `workspace/app/web/src/lib/saved-search-dates.ts` | Saves the chosen dates and falls back to defaults when old dates are in the past. |
| `workspace/app/web/src/App.tsx` | Shows the date controls and applies the exact-date or flexible-date rules. |

### 5. Search Memory

What it does:
Remembers useful user settings like dates, origin, trip settings, and filters between visits.

Why it matters:
Returning users do not have to rebuild the same search every time.

Main files:

| File | What it does |
| --- | --- |
| `workspace/app/web/src/lib/saved-search-preferences.ts` | Saves general search settings. |
| `workspace/app/web/src/lib/saved-search-dates.ts` | Saves departure and return date windows. |
| `workspace/app/web/src/lib/saved-origin.ts` | Saves the chosen home airport. |

### 6. Live Fare Search

What it does:
Runs a real search, shows progress while it is working, and lets the user cancel if needed.

Why it matters:
Real flight searches can take time, so the app tries to keep the user informed instead of freezing.

Main files:

| File | What it does |
| --- | --- |
| `workspace/app/web/src/lib/api.ts` | Starts searches and polls live job progress. |
| `workspace/app/web/src/App.tsx` | Starts searches, tracks progress, and handles canceling from the UI. |
| `workspace/app/src/server/index.ts` | API routes for starting searches and checking live search jobs. |
| `workspace/app/src/server/search-jobs.ts` | Keeps track of search jobs while they run. |

### 7. Search Engine

What it does:
Builds date combinations, asks providers for prices, compares results, and decides what the "best" output should look like.

Why it matters:
This is the core brain of the product.

Main files:

| File | What it does |
| --- | --- |
| `workspace/app/src/core/search.ts` | Main search engine. Handles searching, scoring, combining, and progress reporting. |
| `workspace/app/src/shared/schemas.ts` | Validates incoming search data. |
| `workspace/app/src/shared/types.ts` | Shared TypeScript definitions for requests, fares, progress, and results. |
| `workspace/app/src/core/utils.ts` | General helper functions used by the search engine. |

### 8. Google Flights Integration

What it does:
Talks to Google Flights behind the scenes to get calendar prices and exact fare options.

Why it matters:
This is where the actual flight pricing data comes from.

Main files:

| File | What it does |
| --- | --- |
| `workspace/app/src/providers/google-flights/provider.ts` | Main provider class that runs Google Flights searches. |
| `workspace/app/src/providers/google-flights/client.ts` | Network client used to send requests. |
| `workspace/app/src/providers/google-flights/encoding.ts` | Converts app searches into the special request format Google Flights expects. |
| `workspace/app/src/providers/google-flights/parsing.ts` | Reads Google's response and turns it into app-friendly data. |
| `workspace/app/src/providers/google-flights/types.ts` | Type definitions for the provider layer. |
| `workspace/app/web/src/lib/google-flights-link.ts` | Builds handoff links so users can open similar searches in Google Flights. |

### 9. Result Cards And Fare Comparison

What it does:
Shows the cheapest options, date-price strips, flight details, booking source notes, and other summary cards.

Why it matters:
A search is only useful if the user can quickly understand the answer.

Main files:

| File | What it does |
| --- | --- |
| `workspace/app/web/src/components/ResultsView.tsx` | Main results screen. |
| `workspace/app/src/core/fare-characteristics.ts` | Helps describe bag rules and fare qualities. |
| `workspace/app/src/core/booking-source-supplement.ts` | Adds more detail about whether booking looks direct with the airline or through a third party. |
| `workspace/app/src/providers/amadeus/missing-info-supplement.ts` | Optional helper that fills in missing booking details using Amadeus data. |

### 10. Timing Guidance And "Should I Wait?"

What it does:
Gives a simple recommendation about whether a fare looks low, normal, or worth booking soon.

Why it matters:
People do not just want the cheapest fare. They also want to know if it is a good time to buy.

Main files:

| File | What it does |
| --- | --- |
| `workspace/app/src/core/timing-guidance.ts` | Builds the wait-or-book guidance. |
| `workspace/app/web/src/components/ResultsView.tsx` | Displays the guidance to the user. |

### 11. Cabin Upgrade Comparison

What it does:
Checks nearby cabin options, like whether paying a little more for a better cabin might be worth it.

Why it matters:
Sometimes the jump from economy to a higher cabin is smaller than expected.

Main files:

| File | What it does |
| --- | --- |
| `workspace/app/web/src/lib/cabin-upgrade.ts` | Builds upgrade comparison requests and labels. |
| `workspace/app/web/src/App.tsx` | Triggers and shows upgrade comparison state. |

### 12. Admin / Diagnostics Panel

What it does:
Shows logs, health checks, UI state, and diagnostic reports for debugging.

Why it matters:
When something breaks, this makes it much easier to understand what happened.

Main files:

| File | What it does |
| --- | --- |
| `workspace/app/web/src/components/AdminPanel.tsx` | Admin UI in the browser. |
| `workspace/app/web/src/lib/admin-log.ts` | Client-side logging helpers. |
| `workspace/app/src/server/admin-log.ts` | Server-side log storage for the session. |
| `workspace/app/src/server/incident-log.ts` | Writes important crash or incident records. |
| `workspace/app/src/server/index.ts` | Health, log, and incident API routes. |

### 13. Command-Line Version

What it does:
Runs searches without the browser, directly from the terminal.

Why it matters:
Useful for scripting, debugging, or quick tests.

Main files:

| File | What it does |
| --- | --- |
| `workspace/app/src/cli/index.ts` | The command-line entry point. |

## File Guide

This section is a map of the app by file.

### Root And Build Files

| File | Plain-English purpose |
| --- | --- |
| `README.md` | Top-level project intro. |
| `setup-and-launch.bat` | Windows setup and launch helper. |
| `setup-and-launch.desktop` | Linux desktop setup and launch helper. |
| `setup-and-launch.app` | macOS app bundle that runs the setup and launch helper. |
| `workspace/app/package.json` | Lists app dependencies and npm commands. |
| `workspace/app/package-lock.json` | Exact dependency lockfile so installs stay consistent. |
| `workspace/app/README.md` | Short app-specific README. |
| `workspace/app/tsconfig.json` | TypeScript compiler rules. |
| `workspace/app/tsup.config.ts` | Build rules for the server code. |
| `workspace/app/vite.config.ts` | Build and dev-server rules for the web app. |
| `workspace/app/vitest.config.ts` | Test runner configuration. |
| `workspace/app/web/index.html` | The browser page shell the React app loads into. |

### Data Files

| File | Plain-English purpose |
| --- | --- |
| `workspace/app/data/airports.csv` | Airport master list used for lookups. |
| `workspace/app/data/airlines.csv` | Airline master list used for lookups. |

### Shared Files

| File | Plain-English purpose |
| --- | --- |
| `workspace/app/src/shared/types.ts` | Shared data shapes used by the browser, server, and search engine. |
| `workspace/app/src/shared/schemas.ts` | Validates search data so bad input is caught early. |
| `workspace/app/src/shared/schemas.test.ts` | Tests that the shared validation rules work correctly. |

### Server Files

| File | Plain-English purpose |
| --- | --- |
| `workspace/app/src/server/index.ts` | Main server file. Defines API routes, static file serving, logging, and rate limiting. |
| `workspace/app/src/server/search-jobs.ts` | Tracks long-running live searches and their progress. |
| `workspace/app/src/server/admin-log.ts` | Stores server log entries for the admin panel. |
| `workspace/app/src/server/incident-log.ts` | Writes important incidents to disk so crashes are not lost. |
| `workspace/app/src/server/incident-log.test.ts` | Tests the incident log behavior. |

### Core Search Engine Files

| File | Plain-English purpose |
| --- | --- |
| `workspace/app/src/core/search.ts` | Main flight search engine and result builder. |
| `workspace/app/src/core/search.test.ts` | Tests the main search engine behavior. |
| `workspace/app/src/core/timing-guidance.ts` | Generates the fare timing recommendation. |
| `workspace/app/src/core/timing-guidance.test.ts` | Tests the timing guidance rules. |
| `workspace/app/src/core/catalog.ts` | Airport and airline lookup helpers. |
| `workspace/app/src/core/catalog.test.ts` | Tests the catalog lookup logic. |
| `workspace/app/src/core/utils.ts` | Shared utility helpers for search, filtering, sorting, and date math. |
| `workspace/app/src/core/utils.test.ts` | Tests the utility helpers. |
| `workspace/app/src/core/cache.ts` | Disk cache used to avoid repeating the same expensive provider requests too often. |
| `workspace/app/src/core/cache.test.ts` | Tests the cache behavior. |
| `workspace/app/src/core/fare-characteristics.ts` | Looks at fare details like carry-on behavior. |
| `workspace/app/src/core/booking-source-supplement.ts` | Improves booking-source details, especially for direct-vs-third-party hints. |
| `workspace/app/src/core/booking-source-supplement.test.ts` | Tests booking-source enrichment. |
| `workspace/app/src/core/project-paths.ts` | Central helper for building safe project file paths. |

### Google Flights Provider Files

| File | Plain-English purpose |
| --- | --- |
| `workspace/app/src/providers/google-flights/provider.ts` | Main Google Flights provider logic. |
| `workspace/app/src/providers/google-flights/client.ts` | Low-level HTTP client for Google Flights requests. |
| `workspace/app/src/providers/google-flights/encoding.ts` | Encodes search requests into Google's expected payload shape. |
| `workspace/app/src/providers/google-flights/parsing.ts` | Parses Google Flights responses into usable app results. |
| `workspace/app/src/providers/google-flights/types.ts` | Type definitions for Google Flights data. |
| `workspace/app/src/providers/google-flights/provider.test.ts` | Tests the provider flow. |

### Amadeus Provider Files

| File | Plain-English purpose |
| --- | --- |
| `workspace/app/src/providers/amadeus/client.ts` | Talks to the Amadeus API. |
| `workspace/app/src/providers/amadeus/types.ts` | Type definitions for Amadeus data. |
| `workspace/app/src/providers/amadeus/missing-info-supplement.ts` | Uses Amadeus to fill missing fare or booking details when available. |
| `workspace/app/src/providers/amadeus/missing-info-supplement.test.ts` | Tests the Amadeus supplement behavior. |

### CLI Files

| File | Plain-English purpose |
| --- | --- |
| `workspace/app/src/cli/index.ts` | Lets the app run from the terminal instead of the browser. |

### Web App Main Files

| File | Plain-English purpose |
| --- | --- |
| `workspace/app/web/src/main.tsx` | Starts the browser app. |
| `workspace/app/web/src/App.tsx` | Main page and main state container for the UI. |
| `workspace/app/web/src/styles.css` | Main stylesheet for the browser app. |
| `workspace/app/web/src/vite-env.d.ts` | Vite and TypeScript browser environment types. |

### Web Components

| File | Plain-English purpose |
| --- | --- |
| `workspace/app/web/src/components/AdminPanel.tsx` | Browser diagnostics and debugging panel. |
| `workspace/app/web/src/components/AirlinePicker.tsx` | Airline selector UI. |
| `workspace/app/web/src/components/AirportField.tsx` | Airport search field UI. |
| `workspace/app/web/src/components/ResultsView.tsx` | Results screen UI. |
| `workspace/app/web/src/components/TimeRangeSlider.tsx` | Time window slider for departure and arrival filters. |

### Web Browser Helper Files

| File | Plain-English purpose |
| --- | --- |
| `workspace/app/web/src/lib/api.ts` | Browser-side API client for talking to the server. |
| `workspace/app/web/src/lib/api.test.ts` | Tests the browser API client. |
| `workspace/app/web/src/lib/admin-log.ts` | Client-side logging and browser error capture. |
| `workspace/app/web/src/lib/cabin-upgrade.ts` | Cabin upgrade helper logic. |
| `workspace/app/web/src/lib/cabin-upgrade.test.ts` | Tests the cabin upgrade helpers. |
| `workspace/app/web/src/lib/date-input.ts` | Date formatting and date movement helpers used by the UI. |
| `workspace/app/web/src/lib/date-input.test.ts` | Tests the date helpers. |
| `workspace/app/web/src/lib/google-flights-link.ts` | Builds user-facing Google Flights links. |
| `workspace/app/web/src/lib/google-flights-link.test.ts` | Tests the Google Flights link builder. |
| `workspace/app/web/src/lib/request-dates.ts` | Keeps date fields valid as users edit the form. |
| `workspace/app/web/src/lib/request-dates.test.ts` | Tests the date-adjustment rules. |
| `workspace/app/web/src/lib/saved-origin.ts` | Saves and reloads the user's chosen origin airport. |
| `workspace/app/web/src/lib/saved-origin.test.ts` | Tests saved-origin behavior. |
| `workspace/app/web/src/lib/saved-search-dates.ts` | Saves and reloads chosen dates, including stale-date fallback behavior. |
| `workspace/app/web/src/lib/saved-search-dates.test.ts` | Tests saved date behavior. |
| `workspace/app/web/src/lib/saved-search-preferences.ts` | Saves and reloads search settings other than dates. |
| `workspace/app/web/src/lib/saved-search-preferences.test.ts` | Tests saved-preference behavior. |
| `workspace/app/web/src/lib/timezone-origin.ts` | Turns browser time zone into a rough origin guess. |
| `workspace/app/web/src/lib/timezone-origin.test.ts` | Tests the time-zone origin guesser. |
| `workspace/app/web/src/lib/types.ts` | Browser-friendly type exports for the web app. |

## Fast "Where Do I Change This?" Guide

| If you want to change... | Start here |
| --- | --- |
| Main page layout or controls | `workspace/app/web/src/App.tsx` |
| Result cards or result wording | `workspace/app/web/src/components/ResultsView.tsx` |
| Admin/debug panel | `workspace/app/web/src/components/AdminPanel.tsx` |
| Airport or airline search behavior | `workspace/app/src/core/catalog.ts` and `workspace/app/web/src/lib/api.ts` |
| Default dates or trip-length rules | `workspace/app/web/src/App.tsx` and `workspace/app/web/src/lib/request-dates.ts` |
| Saved preferences behavior | `workspace/app/web/src/lib/saved-search-preferences.ts` and `workspace/app/web/src/lib/saved-search-dates.ts` |
| Search API routes | `workspace/app/src/server/index.ts` |
| Live search job tracking | `workspace/app/src/server/search-jobs.ts` |
| Search engine logic | `workspace/app/src/core/search.ts` |
| Timing / buy-now guidance | `workspace/app/src/core/timing-guidance.ts` |
| Google Flights request or parsing behavior | `workspace/app/src/providers/google-flights/encoding.ts` and `workspace/app/src/providers/google-flights/parsing.ts` |
| Styling | `workspace/app/web/src/styles.css` |

## Final Notes

You do not need to understand every file to work on the app.

In most cases:

- UI changes start in `workspace/app/web/src/App.tsx` or `workspace/app/web/src/components`
- search behavior starts in `workspace/app/src/core/search.ts`
- server/API behavior starts in `workspace/app/src/server/index.ts`
- provider behavior starts in `workspace/app/src/providers/google-flights`

If you get lost, start from the feature you care about first, not the whole codebase.
