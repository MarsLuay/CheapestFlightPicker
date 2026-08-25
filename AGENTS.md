# CheapestFlightPicker agent instructions

Inherit the vault-root AGENTS.md.

<!-- project-memory-bootstrap:v1 -->
## Project memory bootstrap

From this project root, before any task, run:

```bash
python3 ../../scripts/project-memory-context.py --root . --task "<current task>"
```

Read every path listed under Required source reads before editing. A non-zero result blocks the task; repair the project contract or route before continuing. Edit durable tasks and memory only at contract-listed paths.
<!-- /project-memory-bootstrap:v1 -->

