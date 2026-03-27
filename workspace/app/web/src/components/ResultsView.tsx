import type { ReactNode } from "react";

import { buildGoogleFlightsSearchLinks } from "../lib/google-flights-link";
import type {
  BookingSourceType,
  DatePrice,
  FlightOption,
  PriceAlert,
  SearchProgress,
  SearchRequest,
  SearchSummary,
  TimingConfidence,
  TimingGuidance,
  UpgradeFareCardState
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

function ResultPlaceholderCard({
  title,
  message,
  kicker,
  children,
  className
}: {
  title: string;
  message: string;
  kicker?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section className={className ? `result-card ${className}` : "result-card"}>
      <header>
        <div>
          {kicker ? <p className="section-kicker">{kicker}</p> : null}
          <h3>{title}</h3>
        </div>
      </header>
      <p className="muted-copy">{message}</p>
      {children}
    </section>
  );
}

function SearchProgressBlock({
  label,
  progress
}: {
  label: string;
  progress: SearchProgress;
}) {
  return (
    <div className="search-progress search-progress--card" role="status" aria-live="polite">
      <div
        className="search-progress__bar"
        aria-label={label}
        aria-valuemax={progress.totalSteps}
        aria-valuemin={0}
        aria-valuenow={progress.completedSteps}
        role="progressbar"
      >
        <div
          className="search-progress__fill"
          style={{ width: `${progress.percent}%` }}
        />
      </div>
      <div className="search-progress__copy">
        <p className="muted-copy">{progress.stage}</p>
        {progress.detail ? <p className="muted-copy">{progress.detail}</p> : null}
        <p className="muted-copy">
          {progress.percent}% complete ({progress.completedSteps}/{progress.totalSteps} steps)
        </p>
        {progress.previewInspectedOptions ? (
          <p className="muted-copy">
            Best live fare after {progress.previewInspectedOptions} checked candidate
            {progress.previewInspectedOptions === 1 ? "" : "s"}.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function PriceStrip({
  dates,
  label,
  emptyMessage
}: {
  dates: DatePrice[];
  label: string;
  emptyMessage: string;
}) {
  if (dates.length === 0) {
    return <ResultPlaceholderCard message={emptyMessage} title={label} />;
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

function getTimingConfidenceLabel(confidence: TimingConfidence) {
  switch (confidence) {
    case "high":
      return "High confidence";
    case "medium":
      return "Medium confidence";
    default:
      return "Low confidence";
  }
}

function getPriceAlertBadgeLabel(alert: PriceAlert) {
  if (alert.kind === "new_low") {
    return "New low";
  }

  return alert.kind === "significant_rise"
    ? `+${alert.changePercent}%`
    : `-${alert.changePercent}%`;
}

function TimingGuidanceCard({
  guidance,
  isSearching
}: {
  guidance: TimingGuidance | null;
  isSearching: boolean;
}) {
  if (!guidance) {
    return (
      <ResultPlaceholderCard
        kicker="Timing guidance"
        message={
          isSearching
            ? "Timing guidance fills in after the live fare comparison finishes."
            : "Not enough history has built up yet to make a solid book-now versus wait call."
        }
        title={isSearching ? "Timing read coming up" : "No timing read yet"}
      />
    );
  }

  return (
    <section className="result-card timing-card">
      <header>
        <div>
          <p className="section-kicker">Timing guidance</p>
          <h3>{guidance.headline}</h3>
          <p className="muted-copy">{guidance.summary}</p>
        </div>
        <div className="timing-card__signals">
          <span
            className={`timing-pill timing-pill--${guidance.recommendation}`}
          >
            {guidance.recommendation === "book_now" ? "Book now" : "Wait"}
          </span>
          <span className="source-badge source-badge--unknown">
            {getTimingConfidenceLabel(guidance.confidence)}
          </span>
        </div>
      </header>

      <div className="timing-card__stats">
        <div className="price-pill">
          <strong>Current best</strong>
          <span>{formatPrice(guidance.currentBestPrice, guidance.currency)}</span>
        </div>
        <div className="price-pill">
          <strong>Seen range</strong>
          <span>
            {formatPrice(guidance.observedLowPrice, guidance.currency)}
            {" - "}
            {formatPrice(guidance.observedHighPrice, guidance.currency)}
          </span>
        </div>
        <div className="price-pill">
          <strong>Watch history</strong>
          <span>
            {guidance.historySampleSize} check
            {guidance.historySampleSize === 1 ? "" : "s"}
          </span>
        </div>
        <div className="price-pill">
          <strong>Lead time</strong>
          <span>
            {guidance.daysUntilDeparture} day
            {guidance.daysUntilDeparture === 1 ? "" : "s"} to departure
          </span>
        </div>
      </div>

      <ul className="note-list">
        {guidance.reasons.map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>
    </section>
  );
}

function PriceAlertCard({
  alert,
  isSearching
}: {
  alert: PriceAlert | null;
  isSearching: boolean;
}) {
  if (!alert) {
    return (
      <ResultPlaceholderCard
        kicker="Price alert"
        message={
          isSearching
            ? "Price alerts are checked after the current live search settles on its fare comparisons."
            : "No big fare swing has shown up yet, so there is nothing to flag right now."
        }
        title={isSearching ? "Watching for an alert" : "No alert right now"}
      />
    );
  }

  return (
    <section className="result-card deal-card">
      <header>
        <div>
          <p className="section-kicker">Price alert</p>
          <h3>{alert.headline}</h3>
          <p className="muted-copy">{alert.summary}</p>
        </div>
        <span className={`alert-pill alert-pill--${alert.kind}`}>
          {getPriceAlertBadgeLabel(alert)}
        </span>
      </header>
    </section>
  );
}

function OptionCard({
  option,
  request,
  title,
  emptyMessage,
  summaryNote,
  progress,
  progressLabel,
  highlight
}: {
  option: FlightOption | null;
  request: SearchRequest;
  title: string;
  emptyMessage: string;
  summaryNote?: string;
  progress?: SearchProgress | null;
  progressLabel?: string;
  highlight?: boolean;
}) {
  const cardClassName = highlight ? "result-card--cheapest-overall" : undefined;

  if (!option) {
    return (
      <ResultPlaceholderCard
        className={cardClassName}
        message={emptyMessage}
        title={title}
      >
        {summaryNote ? <p className="muted-copy">{summaryNote}</p> : null}
        {progress ? (
          <SearchProgressBlock
            label={progressLabel ?? `Searching ${title}`}
            progress={progress}
          />
        ) : null}
      </ResultPlaceholderCard>
    );
  }

  const searchLinks = buildGoogleFlightsSearchLinks(option, request);

  return (
    <section className={cardClassName ? `result-card ${cardClassName}` : "result-card"}>
      <header>
        <div>
          <h3>{title}</h3>
          <p className="muted-copy">
            {option.outboundDate ? `Outbound ${formatDate(option.outboundDate)}` : ""}
            {option.returnDate ? ` | Return ${formatDate(option.returnDate)}` : ""}
          </p>
          {summaryNote ? <p className="muted-copy">{summaryNote}</p> : null}
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
      {progress ? (
        <SearchProgressBlock
          label={progressLabel ?? `Searching ${title}`}
          progress={progress}
        />
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
  showResults,
  isSearching,
  mainSearchProgress,
  summary,
  upgradeFareBox
}: {
  showResults: boolean;
  isSearching: boolean;
  mainSearchProgress: SearchProgress | null;
  summary: SearchSummary | null;
  upgradeFareBox: UpgradeFareCardState | null;
}) {
  if (!showResults) {
    return null;
  }

  if (!summary) {
    return (
      <section className="results-shell placeholder-card">
        <h2>{isSearching ? "Starting live search" : "No search summary yet"}</h2>
        <p>
          {isSearching
            ? "The cards will start filling in as soon as the first live fare checks finish."
            : "The search did not return a usable result summary. Try adjusting your filters or check the error banner above."}
        </p>
      </section>
    );
  }

  return (
    <section className="results-shell">
      <div className="results-header">
        <div>
          <h2>{isSearching ? "Live search in progress" : "Search summary"}</h2>
          <p>
            {isSearching ? "Checked" : "Evaluated"}{" "}
            {summary.evaluatedDatePairs.length} date combination
            {summary.evaluatedDatePairs.length === 1 ? "" : "s"} and{" "}
            {summary.inspectedOptions} qualifying flight option
            {summary.inspectedOptions === 1 ? "" : "s"}
            {isSearching ? " so far." : "."}
          </p>
          {isSearching ? (
            <p className="muted-copy">
              These cards update live as lower fares show up.
            </p>
          ) : null}
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

      <PriceAlertCard alert={summary.priceAlert} isSearching={isSearching} />
      <details className="results-disclosure">
        <summary className="results-disclosure__summary">
          <div>
            <p className="section-kicker">Details</p>
            <h3>Specifics + Extras</h3>
            <p className="muted-copy">
              Best departure dates, best return dates, and timing guidance.
            </p>
          </div>
          <span className="results-disclosure__chevron" aria-hidden="true">
            v
          </span>
        </summary>
        <div className="results-disclosure__content">
          <PriceStrip
            dates={summary.departureDatePrices}
            emptyMessage={
              isSearching
                ? "Still ranking departure dates as live fares keep coming in."
                : "No standout departure dates surfaced from this run."
            }
            label="Best departure dates"
          />
          <PriceStrip
            dates={summary.returnDatePrices}
            emptyMessage={
              summary.request.tripType === "round_trip" && isSearching
                ? "Still ranking return dates while the tool compares date pairs."
                : summary.request.tripType === "round_trip"
                  ? "No standout return dates surfaced from this run."
                : "Return dates only apply when you're searching round-trip."
            }
            label="Best return dates"
          />
          <TimingGuidanceCard
            guidance={summary.timingGuidance}
            isSearching={isSearching}
          />
        </div>
      </details>

      <div className="result-grid">
        <OptionCard
          title="Cheapest overall"
          option={summary.cheapestOverall}
          request={summary.request}
          highlight
          progress={isSearching ? mainSearchProgress : null}
          progressLabel="Pinning down the cheapest overall fare"
          emptyMessage={
            isSearching
              ? "Waiting for the first live fare to land so this card can start updating."
              : "Nothing qualified as the overall cheapest option yet."
          }
        />
        <OptionCard
          title="Cheapest round-trip"
          option={summary.cheapestRoundTrip}
          request={summary.request}
          emptyMessage={
            summary.request.tripType === "one_way"
              ? "Round-trip fares only appear when you're searching round-trip."
              : isSearching
                ? "Still checking full round-trip fares against the other options."
                : "No round-trip result qualified."
          }
        />
        <OptionCard
          title="Cheapest two one-ways"
          option={summary.cheapestTwoOneWays}
          request={summary.request}
          summaryNote={summary.hackerFareInsight?.summary}
          emptyMessage={
            summary.request.tripType === "one_way"
              ? "Two one-way combinations only apply when you're searching round-trip."
              : isSearching
                ? "Still comparing separate outbound and return fares against round-trip tickets."
                : "No two one-way combination beat the current candidates."
          }
        />
        <OptionCard
          title="Cheapest nonstop"
          option={summary.cheapestNonstop}
          request={summary.request}
          emptyMessage={
            isSearching
              ? "Still checking for the cheapest qualifying nonstop option."
              : "No nonstop option qualified."
          }
        />
        <OptionCard
          title="Cheapest option with stops"
          option={summary.cheapestMultiStop}
          request={summary.request}
          emptyMessage={
            isSearching
              ? "Still checking whether any stop-inclusive itinerary beats the current field."
              : "No stop-inclusive option qualified."
          }
        />
        {upgradeFareBox ? (
          <OptionCard
            title={upgradeFareBox.title}
            option={upgradeFareBox.option}
            request={upgradeFareBox.request}
            summaryNote={upgradeFareBox.summaryNote}
            progress={upgradeFareBox.progress}
            progressLabel={`Searching ${upgradeFareBox.title}`}
            emptyMessage={upgradeFareBox.emptyMessage}
          />
        ) : null}
      </div>
    </section>
  );
}
