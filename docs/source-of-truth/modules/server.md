# Module — server

**Paths:** `workspace/app/src/server/`  
**Purpose:** Express HTTP API, in-memory search jobs, admin/incident logs, SPA static hosting.  
**Public surface:** default Express `app`; job helpers; `getSearchFailureResponse`; incident + admin log APIs  
**Depends on:** `core`, `shared`  
**Invariants:** Jobs are process-local; frontend rate-limit 240/min on static; search API not separately rate-limited; every `/api/admin/*` route requires a configured admin key and returns `401` when configuration is missing or invalid
**Related functions:** [functions/server.md](../functions/server.md)
