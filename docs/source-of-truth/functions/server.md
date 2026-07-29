# Functions — server

Source roots: `workspace/app/src/server/`

| Symbol | File | Signature | Purpose | Side effects / errors |
| --- | --- | --- | --- | --- |
| `createSearchJob` / `getSearchJob` / `updateSearchJobProgress` / `updateSearchJobResumeCheckpoint` / `completeSearchJob` / `failSearchJob` | `search-jobs.ts` | job CRUD | In-memory job lifecycle | Mutates Map; prune stale |
| `getSearchFailureResponse` | `search-errors.ts` | `(error) => {message, statusCode}` | Map errors → HTTP | 429/503/400 |
| `writeIncidentLog` / `writeIncidentLogSafely` / `ensureIncidentLogDirectory` | `incident-log.ts` | various | Disk incident JSON | FS; safe swallows |
| `appendServerLog` / `getServerLogs` / `clearServerLogs` | `admin-log.ts` | various | Ring buffer logs | Memory; optional disk |
| default `app` | `index.ts` | Express | Routes + listen | See entrypoints |
