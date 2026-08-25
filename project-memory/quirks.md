# Quirks

- The browser can load bundled airport and airline CSV catalogs before falling back to the API.
- Saved search preferences, dates, and origin may be kept in browser local storage; the project documents no analytics or advertising SDKs.
- The hidden admin panel opens with backtick or tilde and exposes logs, origin diagnostics, timing guidance, price alerts, and Hacker Fare state.
- Initial origin selection prefers a saved origin, then timezone inference, then the `SEA` fallback; the UI also starts with a flexible date window unless exact dates are selected.
- The root launchers are designed to fetch the rest of the repository into a sibling `CheapestFlightPicker` directory and may install missing Git/Node.js when supported by the host.

Sources: `README.md`, `workspace/app/README.md`, and `workspace/app/web/src/App.tsx`.
