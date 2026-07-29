# Module — cli

**Paths:** `workspace/app/src/cli/`  
**Purpose:** Commander CLI for one-shot searches without the UI.  
**Public surface:** none (entry script)  
**Depends on:** `core/search`, `shared` types (manual request build)  
**Invariants:** Core `search()` still Zod-validates; passengers hard-coded 1 adult in CLI builder  
**Related functions:** [functions/cli.md](../functions/cli.md)
