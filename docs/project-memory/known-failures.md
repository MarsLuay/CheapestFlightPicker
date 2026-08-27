# Known failures and accepted limitations

- Hosted searches may fail or be unavailable because Google rate-limits shared hosted traffic; local execution is the workaround.
- If another local service occupies the default port `8787`, the launcher must validate `/api/health` before reuse and select the next available port; otherwise the browser can open the unrelated OpenAI API welcome page instead of the picker.
- Real-device and narrow-viewport mobile verification remains manual QA.
- Static UX analysis can flag empty `catch` blocks in minified third-party vendor assets; this is not app-source failure.
- The low-severity `esbuild` advisory affects the Windows development server only; production start does not expose it.
- Windows batch calls to `:run_powershell` must not contain raw PowerShell `|` operators; `cmd.exe` can execute the call in a child pipeline context and report `The system cannot find the batch label specified - run_powershell`.
- React and React DOM must resolve to the same version; mismatched patch releases can throw minified React error `#527` before mount, leaving only the page background. Keep their dependency ranges aligned and preserve the runtime-version regression test.
- Serena review records intentional duplicate logic and seams as maintenance findings: repeated nonstop/time helpers, an empty booking-supplement seam, and repeated UI branches. Refactor only with current-code evidence.

Code references for Serena: `workspace/app/web/src/App.tsx`, `workspace/app/src/providers/google-flights`, `workspace/app/src/core`, and `workspace/app/package.json`.
