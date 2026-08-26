# CheapestFlightPicker agent instructions

Inherit the vault-root AGENTS.md.

## Documentation and memory authority

- Serena is the only current-code documentation authority: use it for symbols, references, implementations, and diagnostics.
- The contract-listed memory bank is the only durable agent documentation and memory authority. Keep stable architecture, decisions, quirks, failures, and tasks there.
- Do not create or maintain `docs/source-of-truth/`, `workspace/app/README.md`, function/type inventories, or duplicate agent documentation. Product-facing `README.md` and legal documents remain user-facing artifacts, not agent memory.

<!-- project-memory-bootstrap:v1 -->
## Memory bank bootstrap (technical name: project-memory)

From this project root, before any task, run:

```bash
python3 ../../scripts/project-memory-context.py --root . --task "<current task>"
```

Read every path listed under Required source reads before editing. A non-zero result blocks the task; repair the project contract or route before continuing. Edit durable tasks and memory only at contract-listed paths.
<!-- /project-memory-bootstrap:v1 -->
