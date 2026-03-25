import { buildGoogleFlightsSearchLinks } from "../lib/google-flights-link";
import type {
  BookingSourceType,
  DatePrice,
  FlightOption,
  SearchRequest,
  SearchSummary
} from "../lib/types";

function formatPrice(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0
  }).format(amount);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium"
  }).format(new Date(`${value}T00:00:00`));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;

  if (hours === 0) {
    return `${remainder}m`;
  }

  if (remainder === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${remainder}m`;
}

function getBookingSourceTone(type: BookingSourceType) {
  switch (type) {
    case "direct_airline":
      return "direct";
    case "ota":
      return "ota";
    case "mixed":
      return "mixed";
    default:
      return "unknown";
  }
}

function getSliceTitle(option: FlightOption, sliceIndex: number) {
  if (option.source !== "two_one_way_combo") {
    return null;
  }

  return sliceIndex === 0 ? "Outbound one-way" : "Return one-way";
}

function PriceStrip({ dates, label }: { dates: DatePrice[]; label: string }) {
  if (dates.length === 0) {
    return null;
  }

  return (
    <section className="result-card result-strip">
      <header>
        <h3>{label}</h3>
      </header>
      <div className="pill-row">
        {dates.slice(0, 10).map((entry) => (
          <div className="price-pill" key={`${label}-${entry.date}`}>
            <strong>{formatDate(entry.date)}</strong>
            <span>{formatPrice(entry.price, "USD")}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function OptionCard({
  option,
  request,
  title,
  emptyMessage
}: {
  option: FlightOption | null;
  request: SearchRequest;
  title: string;
  emptyMessage: string;
}) {
  if (!option) {
    return (
      <section className="result-card">
        <header>
          <h3>{title}</h3>
        </header>
        <p className="muted-copy">{emptyMessage}</p>
      </section>
    );
  }

  const searchLinks = buildGoogleFlightsSearchLinks(option, request);

  return (
    <section className="result-card">
      <header>
        <div>
          <h3>{title}</h3>
          <p className="muted-copy">
            {option.outboundDate ? `Outbound ${formatDate(option.outboundDate)}` : ""}
            {option.returnDate ? ` | Return ${formatDate(option.returnDate)}` : ""}
          </p>
        </div>
        <div className="price-stack">
          <strong className="big-price">
            {formatPrice(option.totalPrice, option.currency)}
          </strong>
          <span
            className={`source-badge source-badge--${getBookingSourceTone(
              option.bookingSource.type
            )}`}
            title={option.bookingSource.url}
          >
            {option.bookingSource.label}
          </span>
        </div>
      </header>
      <div className="option-stack">
        {option.slices.map((slice, sliceIndex) => (
          <article className="slice-card" key={`${title}-${sliceIndex}`}>
            {getSliceTitle(option, sliceIndex) || option.slicePrices?.[sliceIndex] !== undefined ? (
              <div className="slice-card__header">
                {getSliceTitle(option, sliceIndex) ? (
                  <strong className="slice-card__title">
                    {getSliceTitle(option, sliceIndex)}
                  </strong>
                ) : (
                  <span />
                )}
                {option.slicePrices?.[sliceIndex] !== undefined ? (
                  <span className="slice-card__price">
                    {formatPrice(
                      option.slicePrices[sliceIndex] ?? 0,
                      option.currency
                    )}
                  </span>
                ) : null}
              </div>
            ) : null}
            <div className="slice-meta">
              <span>{formatDuration(slice.durationMinutes)}</span>
              <span>
                {slice.stops === 0
                  ? "Nonstop"
                  : `${slice.stops} stop${slice.stops === 1 ? "" : "s"}`}
              </span>
            </div>
            {slice.legs.map((leg) => (
              <div
                className="leg-row"
                key={`${leg.airlineCode}-${leg.flightNumber}-${leg.departureDateTime}`}
              >
                <div>
                  <strong>
                    {leg.departureAirportCode}
                    {" -> "}
                    {leg.arrivalAirportCode}
                  </strong>
                  <p>
                    {leg.airlineCode} {leg.flightNumber} | {leg.airlineName}
                  </p>
                </div>
                <div className="leg-times">
                  <span>{formatDateTime(leg.departureDateTime)}</span>
                  <span>{formatDateTime(leg.arrivalDateTime)}</span>
                </div>
              </div>
            ))}
          </article>
        ))}
      </div>
      {option.notes && option.notes.length > 0 ? (
        <ul className="note-list">
          {option.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : null}
      {searchLinks.length > 0 ? (
        <div className="result-card__actions">
          {searchLinks.length > 1 ? (
            <p className="result-card__actions-note">
              Open each one-way fare separately:
            </p>
          ) : null}
          {searchLinks.map((link) => (
            <a
              className="secondary-action"
              href={link.href}
              key={link.label}
              rel="noreferrer"
              target="_blank"
            >
              {link.label}
            </a>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function ResultsView({
  hasCompletedSearch,
  summary
}: {
  hasCompletedSearch: boolean;
  summary: SearchSummary | null;
}) {
  if (!hasCompletedSearch) {
    return null;
  }

  if (!summary) {
    return (
      <section className="results-shell placeholder-card">
        <h2>No search summary yet</h2>
        <p>
          The search did not return a usable result summary. Try adjusting your
          filters or check the error banner above.
        </p>
      </section>
    );
  }

  return (
    <section className="results-shell">
      <div className="results-header">
        <div>
          <h2>Search summary</h2>
          <p>
            Evaluated {summary.evaluatedDatePairs.length} date combinations and{" "}
            {summary.inspectedOptions} flight options.
          </p>
          {summary.request.tripType === "round_trip" ? (
            <p className="muted-copy">
              Departure window {formatDate(summary.request.departureDateFrom)} to{" "}
              {formatDate(summary.request.departureDateTo)}. Return window{" "}
              {summary.request.returnDateFrom
                ? formatDate(summary.request.returnDateFrom)
                : "n/a"}{" "}
              to{" "}
              {summary.request.returnDateTo
                ? formatDate(summary.request.returnDateTo)
                : "n/a"}
              . Trip length between {summary.request.minimumTripDays ?? 0} and{" "}
              {summary.request.maximumTripDays ?? 14} day
              {(summary.request.maximumTripDays ?? 14) === 1 ? "" : "s"}.
            </p>
          ) : null}
        </div>
      </div>

      <PriceStrip dates={summary.departureDatePrices} label="Best departure dates" />
      <PriceStrip dates={summary.returnDatePrices} label="Best return dates" />

      <div className="result-grid">
        <OptionCard
          title="Cheapest overall"
          option={summary.cheapestOverall}
          request={summary.request}
          emptyMessage="Nothing qualified as the overall cheapest option yet."
        />
        <OptionCard
          title="Cheapest round-trip"
          option={summary.cheapestRoundTrip}
          request={summary.request}
          emptyMessage="No round-trip result qualified."
        />
        <OptionCard
          title="Cheapest two one-ways"
          option={summary.cheapestTwoOneWays}
          request={summary.request}
          emptyMessage="No two one-way combination beat the current candidates."
        />
        <OptionCard
          title="Cheapest direct there"
          option={summary.cheapestDirectThere}
          request={summary.request}
          emptyMessage="No direct outbound option qualified."
        />
        <OptionCard
          title="Cheapest option with stops"
          option={summary.cheapestMultiStop}
          request={summary.request}
          emptyMessage="No stop-inclusive option qualified."
        />
      </div>
    </section>
  );
}
