# Cheapest Flight Picker

This is a flight search app that compares every single flight within the specifications you give it, and simply feeds you the cheapest options.

It still uses Google Flights when you run it locally on your own machine, and it also gives you both a browser UI and a CLI if you'd want one.

The root of this repo is intentionally pretty clean to let even your grandma run this tool, and the meat of the project lives in `workspace/app`.

## What this thing does

- Searches flexible departure and return windows
- Lets you filter by:
  - departure and arrival time
  - cabin
  - stops
  - airlines
  - direct-booking preference when Google exposes the seller
- Shows these result buckets:
  - Cheapest overall
  - Cheapest round-trip
  - Cheapest two one-ways
  - Cheapest nonstop
  - Cheapest option with stops
- Gives you Google Flights links for the results it finds
- Has a hidden admin panel you can open with `` ` `` or `~` for logs, auto-origin diagnostics, timing guidance, price alerts, and Hacker Fare state

## Easiest way to run it

### Windows

Run the file:

```bat
setup-and-launch.bat
```

### Linux

Open Terminal and run:

```bash
chmod +x setup-and-launch.sh
./setup-and-launch.sh
```

### macOS

Open Terminal and run:

```bash
chmod +x setup-and-launch.sh
./setup-and-launch.sh
```

## Vercel

This repo is also set up for a hosted deployment where both the clickable site
and the API run together.

Live deployment:

`https://cheapest-flight-picker.vercel.app`

Use these settings when you import the repo into Vercel:

- Root Directory: `workspace/app`
- Framework Preset: `Express`
- Build Command: picked up from `workspace/app/vercel.json`

What this setup does:

- builds the React app into `workspace/app/public`
- deploys the Express backend through `workspace/app/server.js`, which loads the
  bundled server output from `dist/server/index.js`
- includes the airport and airline data files plus the built frontend in the
  function bundle

Important:

- local searches can still use Google Flights directly
- hosted searches should not use Google Flights from Vercel because Google
  rate-limits serverless/data-center traffic
- hosted Vercel searches are meant to use Amadeus instead

Add these Vercel project environment variables before expecting hosted search to
work:

- `AMADEUS_CLIENT_ID`
- `AMADEUS_CLIENT_SECRET`
- optional: `AMADEUS_BASE_URL`
- optional: `SEARCH_PROVIDER=amadeus`

Without those env vars, the hosted site will fail fast with a clear
configuration error instead of repeatedly hitting Google Flights and getting
rate-limited.

Hosted-mode tradeoffs:

- this is the reliable way to make Vercel-hosted search work
- Amadeus results are not identical to Google Flights results
- according to the Amadeus Flight Offers Search docs, low-cost carriers plus
  American Airlines, Delta, and British Airways are unavailable in their
  self-service results

This repo also includes `.github/workflows/vercel.yml`, which deploys
`workspace/app` to Vercel from GitHub pushes:

- pushes to `main` create a production deployment
- pushes to any other branch create a preview deployment


## Background

I wanted to visit my girlfriend across the country as a broke college student, and google flights wasn't cutting it for me.

After hours of researching other repos and methods people have released to find the 'cheapest' flight, I found the good resources were all paygated.

I was not happy.
Out of spite, I made this tool.

## License
This repo is source-available under `PolyForm Noncommercial 1.0.0`.

That means:

- you can read the code
- you can learn from it
- you can use it for personal, hobby, research, and other noncommercial stuff

What you cannot do under this license:

- use it commercially
- sell it
- use it in a paid product, paid service, client project, or business workflow without permission

If you want to use this commercially, you need a separate commercial license from the author (me)

Feel free to contact me here at
`https://github.com/MarsLuay` or at [marwanluay2005@gmail.com](mailto:marwanluay2005@gmail.com)

See [LICENSE](LICENSE) for the actual license text.
