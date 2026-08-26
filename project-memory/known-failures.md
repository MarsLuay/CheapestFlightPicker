# Known failures and accepted limitations

- Hosted searches may fail or be unavailable because Google rate-limits shared hosted traffic; local execution is the workaround.
- If another local service occupies the default port `8787`, the launcher must validate `/api/health` before reuse and select the next available port; otherwise the browser can open the unrelated OpenAI API welcome page instead of the picker.
- Real-device and narrow-viewport mobile verification remains manual QA.
- Static UX analysis can flag empty `catch` blocks in minified third-party vendor assets; this is not app-source failure.
- The low-severity `esbuild` advisory affects the Windows development server only; production start does not expose it.
- Serena review records intentional duplicate logic and seams as maintenance findings: repeated nonstop/time helpers, an empty booking-supplement seam, and repeated UI branches. Refactor only with current-code evidence.

Code references for Serena: `workspace/app/web/src/App.tsx`, `workspace/app/src/providers/google-flights`, `workspace/app/src/core`, and `workspace/app/package.json`.
