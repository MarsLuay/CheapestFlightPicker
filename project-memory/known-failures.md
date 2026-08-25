# Known failures and accepted limitations

- Hosted searches are expected to be unavailable or unreliable because Google Flights rate-limits hosted traffic; local execution is the documented workaround.
- Real-device and narrow-viewport mobile verification remains manual QA.
- Static UX analysis can report empty `catch` blocks in minified React vendor assets; this is third-party bundle noise, not app source.
- The documented low-severity `esbuild` advisory affects the Windows development server only; production `npm start` does not expose it, and Dependabot tracks it.
- Clone-analysis info findings include intentional duplication across parallel server/web modules and repeated UI branches; deduplication is explicitly treated as a large, non-user-facing refactor.

Sources: the "Code analysis — wont-fix" section of `README.md` and the hosted-mode message in `workspace/app/web/src/App.tsx`.
