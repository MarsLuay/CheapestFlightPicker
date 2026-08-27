# Quirks

- Browser catalog loading prefers bundled airport/airline CSVs, then falls back to the API.
- Saved preferences, dates, and origin live in browser local storage; no analytics or advertising SDK is shipped.
- Backtick or tilde opens the hidden admin panel with logs, origin diagnostics, timing guidance, price alerts, and Hacker Fare state.
- Origin selection prefers saved origin, then timezone inference, then `SEA`; the initial date mode is flexible unless exact dates are selected.
- Hosted mode blocks interactive search; offline mode can use catalogs/caches but cannot produce new live cheapest fares.
- Root launchers can fetch the repository into a sibling directory and install missing Git/Node when supported by the host.
- The Windows launcher records startup, step, and captured command failures in `%TEMP%\CheapestFlightPicker-setup.log` and prints that path when setup stops.

Code references for Serena: `workspace/app/web/src/App.tsx`, `workspace/app/web/src/lib/catalog.ts`, `workspace/app/src/shared`, and the root launcher scripts.
