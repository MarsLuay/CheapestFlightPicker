import { startTransition, useRef, useState, type FormEvent } from "react";

import { runFlightSearch } from "./lib/api";
import type { SearchProgress, SearchRequest, SearchSummary } from "./lib/types";
import { AdminPanel } from "./components/AdminPanel";
import { AirlinePicker } from "./components/AirlinePicker";
import { AirportField } from "./components/AirportField";
import { ResultsView } from "./components/ResultsView";
import { TimeRangeSlider } from "./components/TimeRangeSlider";

const today = new Date();
const departureStartDate = new Date(today.getTime() + 1000 * 60 * 60 * 24 * 44);
const departureEndDate = new Date(today.getTime() + 1000 * 60 * 60 * 24 * 51);
const returnStartDate = new Date(today.getTime() + 1000 * 60 * 60 * 24 * 51);
const returnEndDate = new Date(today.getTime() + 1000 * 60 * 60 * 24 * 58);

function toIsoDate(value: Date) {
  return value.toISOString().split("T")[0] ?? "";
}

const initialRequest: SearchRequest = {
  tripType: "round_trip",
  origin: "SEA",
  destination: "PIT",
  departureDateFrom: toIsoDate(departureStartDate),
  departureDateTo: toIsoDate(departureEndDate),
  returnDateFrom: toIsoDate(returnStartDate),
  returnDateTo: toIsoDate(returnEndDate),
  minimumTripDays: 7,
  maximumTripDays: 14,
  departureTimeWindow: { from: 6, to: 24 },
  arrivalTimeWindow: { from: 6, to: 24 },
  cabinClass: "economy",
  stopsFilter: "any",
  preferDirectBookingOnly: false,
  airlines: [],
  passengers: {
    adults: 1,
    children: 0,
    infantsInSeat: 0,
    infantsOnLap: 0
  },
  maxResults: 10
};

export default function App() {
  const [request, setRequest] = useState<SearchRequest>(initialRequest);
  const [summary, setSummary] = useState<SearchSummary | null>(null);
  const [error, setError] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [hasCompletedSearch, setHasCompletedSearch] = useState(false);
  const [searchProgress, setSearchProgress] = useState<SearchProgress | null>(null);
  const [useExactDates, setUseExactDates] = useState(false);
  const requestRef = useRef<SearchRequest>(initialRequest);

  function updateRequest(
    updater: SearchRequest | ((currentRequest: SearchRequest) => SearchRequest)
  ) {
    const nextRequest =
      typeof updater === "function"
        ? (updater as (currentRequest: SearchRequest) => SearchRequest)(
            requestRef.current
          )
        : updater;

    requestRef.current = nextRequest;
    setRequest(nextRequest);
  }

  function updateTripType(nextTripType: SearchRequest["tripType"]) {
    updateRequest((currentRequest) => ({
      ...currentRequest,
      tripType: nextTripType,
      returnDateFrom:
        useExactDates && nextTripType === "round_trip"
          ? currentRequest.departureDateFrom
          : currentRequest.returnDateFrom,
      returnDateTo:
        useExactDates && nextTripType === "round_trip"
          ? currentRequest.departureDateTo
          : currentRequest.returnDateTo
    }));
  }

  function updateDepartureDateFrom(nextDepartureDateFrom: string) {
    updateRequest((currentRequest) => ({
      ...currentRequest,
      departureDateFrom: nextDepartureDateFrom,
      returnDateFrom:
        useExactDates && currentRequest.tripType === "round_trip"
          ? nextDepartureDateFrom
          : currentRequest.returnDateFrom
    }));
  }

  function updateReturnDateFrom(nextReturnDateFrom: string) {
    updateRequest((currentRequest) => ({
      ...currentRequest,
      returnDateFrom: nextReturnDateFrom,
      departureDateFrom:
        useExactDates && currentRequest.tripType === "round_trip"
          ? nextReturnDateFrom
          : currentRequest.departureDateFrom
    }));
  }

  function updateDepartureDateTo(nextDepartureDateTo: string) {
    updateRequest((currentRequest) => ({
      ...currentRequest,
      departureDateTo: nextDepartureDateTo,
      returnDateTo:
        useExactDates && currentRequest.tripType === "round_trip"
          ? nextDepartureDateTo
          : currentRequest.returnDateTo
    }));
  }

  function updateReturnDateTo(nextReturnDateTo: string) {
    updateRequest((currentRequest) => ({
      ...currentRequest,
      returnDateTo: nextReturnDateTo,
      departureDateTo:
        useExactDates && currentRequest.tripType === "round_trip"
          ? nextReturnDateTo
          : currentRequest.departureDateTo
    }));
  }

  function updateMinimumTripDays(nextMinimumTripDays: number) {
    updateRequest((currentRequest) => {
      const safeMinimumTripDays = Math.max(0, nextMinimumTripDays);
      const currentMaximumTripDays = currentRequest.maximumTripDays ?? 14;

      return {
        ...currentRequest,
        minimumTripDays: safeMinimumTripDays,
        maximumTripDays: Math.max(
          currentMaximumTripDays,
          safeMinimumTripDays
        )
      };
    });
  }

  function updateMaximumTripDays(nextMaximumTripDays: number) {
    updateRequest((currentRequest) => {
      const safeMaximumTripDays = Math.max(0, nextMaximumTripDays);
      const currentMinimumTripDays = currentRequest.minimumTripDays ?? 0;

      return {
        ...currentRequest,
        minimumTripDays: Math.min(
          currentMinimumTripDays,
          safeMaximumTripDays
        ),
        maximumTripDays: safeMaximumTripDays
      };
    });
  }

  function toggleExactDates(nextUseExactDates: boolean) {
    setUseExactDates(nextUseExactDates);
    if (!nextUseExactDates) {
      return;
    }

    updateRequest((currentRequest) => ({
      ...currentRequest,
      returnDateFrom:
        currentRequest.tripType === "round_trip"
          ? currentRequest.departureDateFrom
          : currentRequest.returnDateFrom,
      returnDateTo:
        currentRequest.tripType === "round_trip"
          ? currentRequest.departureDateTo
          : currentRequest.returnDateTo
    }));
  }

  async function handleSearch(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setIsSearching(true);
    setError("");
    setSearchProgress({
      stage: "Preparing search",
      detail: "Submitting your search request",
      completedSteps: 0,
      totalSteps: 1,
      percent: 0
    });

    try {
      const response = await runFlightSearch(
        {
          ...requestRef.current,
          useExactDates
        },
        setSearchProgress
      );
      if (!response.ok) {
        setError(response.error);
        setSummary(null);
        return;
      }

      startTransition(() => {
        setSummary(response.summary);
      });
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Search failed unexpectedly"
      );
      setSummary(null);
    } finally {
      setIsSearching(false);
      setHasCompletedSearch(true);
      setSearchProgress(null);
    }
  }

  const adminUiSnapshot = {
    tripType: request.tripType,
    origin: request.origin,
    destination: request.destination,
    useExactDates,
    departureDateFrom: request.departureDateFrom,
    departureDateTo: request.departureDateTo,
    returnDateFrom: request.returnDateFrom ?? null,
    returnDateTo: request.returnDateTo ?? null,
    minimumTripDays: request.minimumTripDays ?? 0,
    maximumTripDays: request.maximumTripDays ?? 14,
    departureTimeWindow: request.departureTimeWindow ?? null,
    arrivalTimeWindow: request.arrivalTimeWindow ?? null,
    cabinClass: request.cabinClass,
    stopsFilter: request.stopsFilter,
    preferDirectBookingOnly: request.preferDirectBookingOnly,
    airlines: request.airlines,
    passengers: request.passengers,
    maxResults: request.maxResults,
    isSearching,
    hasCompletedSearch,
    latestError: error || null
  };

  return (
    <div className="app-shell">
      <div className="background-veil" />
      <AdminPanel uiSnapshot={adminUiSnapshot} />
      <main className="page">
        <section className="hero-card">
          <h1>Cheapest Flight Picker</h1>
          <p className="hero-copy">
            Find out what the cheapest (and best) time to book a flight is!
            Just enter in a flexible range (the more flexible the better), and
            press enter to find out the cheapest price that's offered with your
            specifications. Happy traveling!
          </p>
        </section>

        <section className="form-card">
          <form className="search-form" onSubmit={handleSearch}>
            <section className="form-section">
              <div className="section-heading">
                <p className="section-kicker">Start here</p>
                <h2>Route and filters</h2>
                <p className="section-copy">
                  Set the route, seat class, stop limit, and how picky you want
                  the search to be.
                </p>
              </div>

              <div className="form-grid">
                <div className="field filter-field">
                  <span>Trip type</span>
                  <div className="toggle-row">
                    {[
                      { label: "One way", value: "one_way" },
                      { label: "Round trip", value: "round_trip" }
                    ].map((option) => (
                      <button
                        key={option.value}
                        className={`toggle-pill ${
                          request.tripType === option.value ? "is-active" : ""
                        }`}
                        type="button"
                        onClick={() =>
                          updateTripType(option.value as SearchRequest["tripType"])
                        }
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                <AirportField
                  label="Origin airport"
                  value={request.origin}
                  onSelect={(origin) =>
                    updateRequest((currentRequest) => ({
                      ...currentRequest,
                      origin
                    }))
                  }
                />

                <AirportField
                  label="Destination airport"
                  value={request.destination}
                  onSelect={(destination) =>
                    updateRequest((currentRequest) => ({
                      ...currentRequest,
                      destination
                    }))
                  }
                />

                <label className="field filter-field">
                  <span>Cabin</span>
                  <select
                    value={request.cabinClass}
                    onChange={(event) =>
                      updateRequest((currentRequest) => ({
                        ...currentRequest,
                        cabinClass: event.target.value as SearchRequest["cabinClass"]
                      }))
                    }
                  >
                    <option value="economy">Economy</option>
                    <option value="premium_economy">Premium economy</option>
                    <option value="business">Business</option>
                    <option value="first">First</option>
                  </select>
                </label>

                <label className="field filter-field">
                  <span>Stops</span>
                  <select
                    value={request.stopsFilter}
                    onChange={(event) =>
                      updateRequest((currentRequest) => ({
                        ...currentRequest,
                        stopsFilter: event.target.value as SearchRequest["stopsFilter"]
                      }))
                    }
                  >
                    <option value="any">Any</option>
                    <option value="nonstop">Nonstop</option>
                    <option value="max_1_stop">Up to 1 stop</option>
                    <option value="max_2_stops">Up to 2 stops</option>
                  </select>
                </label>

                <label className="field filter-field">
                  <span>Candidate depth</span>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={request.maxResults}
                    onChange={(event) =>
                      updateRequest((currentRequest) => ({
                        ...currentRequest,
                        maxResults: Number.parseInt(event.target.value, 10) || 5
                      }))
                    }
                  />
                  <p className="field-help">
                    Lower is faster. Higher checks more date combos but takes
                    longer.
                  </p>
                </label>

                <label className="checkbox-field filter-field">
                  <input
                    className="checkbox-field__input"
                    type="checkbox"
                    checked={useExactDates}
                    onChange={(event) => toggleExactDates(event.target.checked)}
                  />
                  <span className="checkbox-field__switch" aria-hidden="true">
                    <span className="checkbox-field__knob" />
                  </span>
                  <div>
                    <span>Use exact dates</span>
                    <p className="field-help">
                      Keeps the departure and return windows matched: earliest
                      with earliest, latest with latest.
                    </p>
                  </div>
                </label>

                <label className="checkbox-field filter-field">
                  <input
                    className="checkbox-field__input"
                    type="checkbox"
                    checked={request.preferDirectBookingOnly}
                    onChange={(event) =>
                      updateRequest((currentRequest) => ({
                        ...currentRequest,
                        preferDirectBookingOnly: event.target.checked
                      }))
                    }
                  />
                  <span className="checkbox-field__switch" aria-hidden="true">
                    <span className="checkbox-field__knob" />
                  </span>
                  <div>
                    <span>Prefer direct booking only</span>
                    <p className="field-help">
                      If Google can tell who is selling the ticket,
                      travel-agency fares are removed. If Google cannot tell,
                      the fare may still show up.
                    </p>
                  </div>
                </label>
              </div>
            </section>

            <section className="form-section">
              <div className="section-heading">
                <div>
                  <p className="section-kicker">Dates</p>
                  <h2>Trip window</h2>
                  <p className="section-copy">
                    Give the app a flexible leaving and return window. If exact
                    dates is turned on above, the departure and return windows
                    stay linked together.
                  </p>
                </div>
              </div>

              <div className="date-window-grid">
                <section className="range-card">
                  <h3>Departure date range</h3>
                  <p className="field-help">
                    Pick the earliest and latest day you would be okay leaving.
                  </p>
                  <div className="range-grid">
                    <label className="field">
                      <span>Earliest departure</span>
                      <input
                        type="date"
                        value={request.departureDateFrom}
                        onChange={(event) =>
                          updateDepartureDateFrom(event.target.value)
                        }
                      />
                    </label>

                    <label className="field">
                      <span>Latest departure</span>
                      <input
                        type="date"
                        value={request.departureDateTo}
                        onChange={(event) =>
                          updateDepartureDateTo(event.target.value)
                        }
                      />
                    </label>
                  </div>
                </section>

                {request.tripType === "round_trip" ? (
                  <section className="range-card">
                    <h3>Return date range</h3>
                    <p className="field-help">
                      Pick the earliest and latest day you would be okay coming
                      back.
                    </p>
                    <div className="range-grid">
                      <label className="field">
                        <span>Earliest return</span>
                        <input
                          type="date"
                          value={request.returnDateFrom ?? ""}
                          onChange={(event) =>
                            updateReturnDateFrom(event.target.value)
                          }
                        />
                      </label>

                      <label className="field">
                        <span>Latest return</span>
                        <input
                          type="date"
                          value={request.returnDateTo ?? ""}
                          onChange={(event) =>
                            updateReturnDateTo(event.target.value)
                          }
                        />
                      </label>

                      <label className="field">
                        <span>Minimum trip length</span>
                        <input
                          type="number"
                          min="0"
                          max="180"
                          value={request.minimumTripDays ?? 0}
                          onChange={(event) =>
                            updateMinimumTripDays(
                              Number.parseInt(event.target.value, 10) || 0
                            )
                          }
                        />
                      </label>

                      <label className="field">
                        <span>Maximum trip length</span>
                        <input
                          type="number"
                          min="0"
                          max="180"
                          value={request.maximumTripDays ?? 14}
                          onChange={(event) =>
                            updateMaximumTripDays(
                              Number.parseInt(event.target.value, 10) || 14
                            )
                          }
                        />
                      </label>
                    </div>
                  </section>
                ) : null}
              </div>
            </section>

            <section className="form-section">
              <div className="section-heading">
                <p className="section-kicker">Timing</p>
                <h2>Departure and arrival hours</h2>
                <p className="section-copy">
                  Tighten the time of day if you want to avoid red-eyes,
                  ultra-early departures, or late arrivals.
                </p>
              </div>

              <div className="slider-grid">
                <TimeRangeSlider
                  label="Departure time window"
                  value={request.departureTimeWindow ?? { from: 0, to: 24 }}
                  onChange={(departureTimeWindow) =>
                    updateRequest((currentRequest) => ({
                      ...currentRequest,
                      departureTimeWindow
                    }))
                  }
                />

                <TimeRangeSlider
                  label="Arrival time window"
                  value={request.arrivalTimeWindow ?? { from: 0, to: 24 }}
                  onChange={(arrivalTimeWindow) =>
                    updateRequest((currentRequest) => ({
                      ...currentRequest,
                      arrivalTimeWindow
                    }))
                  }
                />
              </div>
            </section>

            <section className="form-section">
              <div className="section-heading">
                <p className="section-kicker">Optional</p>
                <h2>Airline picks</h2>
                <p className="section-copy">
                  Leave it blank for any airline, or lock the search to the
                  carriers you trust.
                </p>
              </div>

              <AirlinePicker
                selected={request.airlines}
                onChange={(airlines) =>
                  updateRequest((currentRequest) => ({
                    ...currentRequest,
                    airlines
                  }))
                }
              />
            </section>

            <div className="action-row">
              <button
                className="primary-action"
                type="submit"
                disabled={isSearching}
              >
                {isSearching
                  ? "Searching live fares..."
                  : "Find cheapest flights"}
              </button>
            </div>

            {isSearching ? (
              <div className="search-progress" role="status" aria-live="polite">
                <div
                  className="search-progress__bar"
                  aria-label="Searching live fares"
                  aria-valuemax={searchProgress?.totalSteps ?? 1}
                  aria-valuemin={0}
                  aria-valuenow={searchProgress?.completedSteps ?? 0}
                  role="progressbar"
                >
                  <div
                    className="search-progress__fill"
                    style={{ width: `${searchProgress?.percent ?? 0}%` }}
                  />
                </div>
                <div className="search-progress__copy">
                  <p className="muted-copy">
                    {searchProgress?.stage ?? "Searching live fares"}
                  </p>
                  {searchProgress?.detail ? (
                    <p className="muted-copy">{searchProgress.detail}</p>
                  ) : null}
                  <p className="muted-copy">
                    {searchProgress?.percent ?? 0}% complete
                    {searchProgress
                      ? ` (${searchProgress.completedSteps}/${searchProgress.totalSteps} steps)`
                      : ""}
                  </p>
                </div>
              </div>
            ) : null}

            {error ? <p className="error-banner">{error}</p> : null}
          </form>
        </section>

        <ResultsView
          hasCompletedSearch={hasCompletedSearch}
          summary={summary}
        />

        <footer className="app-footer">
          <p className="app-footer__copy">
            Built by{" "}
            <a
              className="app-footer__link"
              href="https://github.com/MarsLuay"
              rel="noreferrer"
              target="_blank"
            >
              MarsLuay
            </a>
            . If this saved you some money, you can also support it on{" "}
            <a
              className="app-footer__link"
              href="https://buymeacoffee.com/marwanluaye"
              rel="noreferrer"
              target="_blank"
            >
              Buy Me a Coffee
            </a>
            .
          </p>
        </footer>
      </main>
    </div>
  );
}
