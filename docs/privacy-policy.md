# Privacy Policy — Cheapest Flight Picker

Last updated: June 27, 2026

Cheapest Flight Picker ("the app") is a local-first flight search tool with an optional browser UI and CLI. This policy describes what information the app handles when you run it.

## Information we collect

When you use the hosted website or local server, the app may process:

- **Search inputs you provide**, such as origin and destination airports, date windows, cabin class, airline filters, and related preferences.
- **Browser-local data** stored in your browser (for example saved origin airport, saved search dates, and saved filter preferences) when you use the web UI.
- **Diagnostic logs** when errors occur, including client error messages, timestamps, page URL, and browser user agent if you trigger the admin incident reporter.
- **Server logs** on the machine running the app, including search job metadata, API errors, and admin diagnostics when admin mode is used.

We do not require account creation and do not ask for your legal name, postal address, or payment card numbers inside the app.

## How we use your information

We use the information above to:

- Run flight searches against Google Flights (when configured and not rate-limited).
- Show search progress, results, timing guidance, and booking links.
- Troubleshoot failures through optional admin and incident logs on the host machine.

## Analytics, cookies, and third-party services

The app does not use advertising SDKs or third-party analytics trackers.

- **Cookies:** The app does not set tracking cookies. Browser **local storage** may be used to remember your preferences on the same device.
- **Third-party services:** Live searches contact **Google Flights** through the integration configured for your deployment. Those requests are subject to Google's terms and privacy practices.
- **Hosting:** If you deploy the web UI to a host such as Vercel, that provider may process network metadata (IP address, request logs) under its own policies.

## Who we share information with

We do not sell your personal information.

Information may be shared only as needed to operate the product:

- **Google Flights** receives the search parameters required to look up fares.
- **Your hosting provider** (if you deploy the site) may process standard web server logs.
- **Incident log files** stay on the machine that runs the server unless you copy or export them through admin tools.

## Retention and deletion

| Data | Retention |
| --- | --- |
| Browser local preferences | Until you clear site data in your browser |
| Server search/job logs | Rotates with normal server log handling on your machine |
| Incident JSON files | Stored under the app runtime `logs` directory until you delete them |
| Admin client logs | Kept in browser memory for the session (max 200 entries) unless cleared in admin mode |

**Data deletion:** Clear your browser site data to remove saved preferences. Delete runtime log files on the server host to remove incident artifacts. Use **Clear client logs** / **Clear server logs** in admin mode where available.

## Your choices and access

You can:

- Run the app entirely on your own computer without using a public deployment.
- Avoid saving preferences by clearing browser storage.
- Request information about locally stored logs by inspecting files on the machine you control.

For questions about a public deployment operated by someone else, contact that operator using the contact section below.

## Contact us

For privacy questions about this project, open an issue in the Cheapest Flight Picker repository or contact the maintainer listed in the project README.

## Sale or sharing of information

We **do not sell** personal information and do not share it for cross-context behavioral advertising.
