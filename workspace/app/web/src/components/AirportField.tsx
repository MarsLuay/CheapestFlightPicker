import {
  useDeferredValue,
  useEffect,
  useState,
  type KeyboardEvent
} from "react";

import { searchAirports } from "../lib/api";
import type { AirportRecord } from "../lib/types";

type AirportFieldProps = {
  label: string;
  value: string;
  onSelect: (code: string) => void;
};

export function AirportField({ label, value, onSelect }: AirportFieldProps) {
  const [query, setQuery] = useState(value);
  const [options, setOptions] = useState<AirportRecord[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isFocused, setIsFocused] = useState(false);
  const [hasCommittedSelection, setHasCommittedSelection] = useState(false);
  const deferredQuery = useDeferredValue(query);
  const trimmedQuery = query.trim();
  const suggestionOptions = options.slice(0, 6);
  const shouldShowSuggestions =
    isFocused &&
    !hasCommittedSelection &&
    trimmedQuery.length >= 2 &&
    suggestionOptions.length > 0;

  useEffect(() => {
    setQuery(value);
    setHasCommittedSelection(false);
  }, [value]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (deferredQuery.trim().length < 2) {
        setOptions([]);
        return;
      }

      const airports = await searchAirports(deferredQuery);
      if (!cancelled) {
        setOptions(airports);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [deferredQuery]);

  useEffect(() => {
    setActiveIndex(0);
  }, [trimmedQuery, options]);

  function selectAirport(airport: AirportRecord) {
    setQuery(airport.iata);
    setActiveIndex(0);
    setHasCommittedSelection(true);
    onSelect(airport.iata);
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!shouldShowSuggestions) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) =>
        Math.min(current + 1, suggestionOptions.length - 1)
      );
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, 0));
      return;
    }

    if (event.key === "Enter" || event.key === "Tab") {
      const match = suggestionOptions[activeIndex] ?? suggestionOptions[0];
      if (match) {
        selectAirport(match);
      }

      if (event.key === "Enter") {
        event.preventDefault();
      }
      return;
    }

    if (event.key === "Escape") {
      setActiveIndex(0);
    }
  }

  return (
    <label className="field filter-field">
      <span>{label}</span>
      <div className="autocomplete-shell">
        <input
          value={query}
          onBlur={() => {
            setIsFocused(false);
            setHasCommittedSelection(false);
          }}
          onChange={(event) => {
            const nextValue = event.target.value;
            setQuery(nextValue);
            setHasCommittedSelection(false);
            if (/^[A-Za-z]{3}$/u.test(nextValue.trim())) {
              onSelect(nextValue.trim().toUpperCase());
            }
          }}
          onFocus={() => {
            setIsFocused(true);
            setHasCommittedSelection(false);
          }}
          onKeyDown={handleInputKeyDown}
          placeholder="Type airport, city, or code"
        />
        {shouldShowSuggestions ? (
          <div className="suggestion-list" role="listbox" aria-label={`${label} matches`}>
            {suggestionOptions.map((airport, index) => (
              <button
                key={airport.id}
                className={`suggestion-option ${
                  index === activeIndex ? "is-active" : ""
                }`}
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault();
                  selectAirport(airport);
                }}
              >
                <span className="suggestion-copy">
                  <strong>
                    {airport.iata} · {airport.city}
                  </strong>
                  <span className="suggestion-detail">{airport.name}</span>
                  <span className="suggestion-detail">{airport.country}</span>
                </span>
                {index === 0 ? (
                  <span className="suggestion-badge">Best match</span>
                ) : null}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </label>
  );
}
