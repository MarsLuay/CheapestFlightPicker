import type { GoogleFlightsSearchLink } from "../lib/google-flights-link";
import type { SearchRequest } from "../lib/types";

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium"
  }).format(new Date(`${value}T00:00:00`));
}

function formatPassengerSummary(request: SearchRequest): string {
  const totalPassengers =
    request.passengers.adults +
    request.passengers.children +
    request.passengers.infantsInSeat +
    request.passengers.infantsOnLap;

  return `${totalPassengers} passenger${totalPassengers === 1 ? "" : "s"}`;
}

function formatTripWindow(request: SearchRequest): string {
  if (request.tripType === "one_way") {
    if (request.departureDateFrom === request.departureDateTo) {
      return formatDate(request.departureDateFrom);
    }

    return `${formatDate(request.departureDateFrom)} to ${formatDate(request.departureDateTo)}`;
  }

  return `${formatDate(request.departureDateFrom)} to ${formatDate(
    request.departureDateTo
  )} outbound, ${request.returnDateFrom ? formatDate(request.returnDateFrom) : "n/a"} to ${
    request.returnDateTo ? formatDate(request.returnDateTo) : "n/a"
  } return`;
}

export function StaticResultsView({
  links,
  request
}: {
  links: GoogleFlightsSearchLink[];
  request: SearchRequest | null;
}) {
  if (!request || links.length === 0) {
    return null;
  }

  return (
    <section className="results-shell">
      <section className="placeholder-card static-results-intro">
        <p className="section-kicker">GitHub Pages results</p>
        <h2>Open your filters on Google Flights</h2>
        <p className="muted-copy">
          This hosted version runs fully client-side, so instead of spinning up the
          repo's local search engine it prepares Google Flights searches using the
          route and filters you selected below.
        </p>

        <div className="pill-row">
          <div className="price-pill">
            <strong>Route</strong>
            <span>
              {request.origin} {"->"} {request.destination}
            </span>
          </div>
          <div className="price-pill">
            <strong>Trip window</strong>
            <span>{formatTripWindow(request)}</span>
          </div>
          <div className="price-pill">
            <strong>Cabin + trip type</strong>
            <span>
              {request.cabinClass.replaceAll("_", " ")} | {request.tripType.replaceAll("_", " ")}
            </span>
          </div>
          <div className="price-pill">
            <strong>Passengers</strong>
            <span>{formatPassengerSummary(request)}</span>
          </div>
        </div>
      </section>

      <section className="result-card static-results-card">
        <header>
          <div>
            <h3>Search links ready</h3>
            <p className="muted-copy">
              Flexible windows on GitHub Pages become one or more helpful Google
              Flights starting points so you can keep going without the local API.
            </p>
          </div>
        </header>

        <div className="static-link-list">
          {links.map((link) => (
            <article className="static-link-card" key={`${link.label}-${link.href}`}>
              <a
                className="secondary-action"
                href={link.href}
                rel="noreferrer"
                target="_blank"
              >
                {link.label}
              </a>
              {link.description ? (
                <p className="muted-copy">{link.description}</p>
              ) : null}
            </article>
          ))}
        </div>

        <ul className="note-list">
          <li>
            Carried over here: route, dates, cabin, passenger counts, airlines,
            stop count, and departure or arrival time windows.
          </li>
          <li>
            Local-only features: live fare comparison, timing guidance, price alerts,
            Search Intelligence, direct-booking preference, and the carry-on filter.
          </li>
        </ul>
      </section>
    </section>
  );
}
