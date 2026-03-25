# Cheapest Flight Picker App
This parts the actual app.

If you're trying to edit code, change the UI, mess with the search logic, it's all going to be in here. 

## What lives in here

- `src/core` is the main search/comparison logic
- `src/providers/google-flights` is the Google Flights request/parsing layer
- `src/server` is the local API/server
- `src/cli` is the command-line version
- `web/src` is the React UI
- `data` has airport and airline reference data
- `.cache` stores short-lived local cache files so repeated searches are faster

## Running it from this folder

If you want to work directly inside the app folder, use these:

```bash
npm install
npm run dev
```

Useful commands:

- `npm run check` for TypeScript checks
- `npm run test` for tests
- `npm run build` for a production build
- `npm start` to run the built server

## Tiny note

If something looks broken:

- open admin mode with `` ` `` or `~`
- copy the report
- send it over

Please for my mental sake send it alongside the issue report, I'll take it as an act of hatred otherwise

## License

Same deal as the root repo:

- noncommercial use is okay
- commercial use needs a separate license from me

See the root [LICENSE](../../LICENSE) for the real legal text.
