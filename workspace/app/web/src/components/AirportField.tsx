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
  multiple?: boolean;
  placeholder?: string;
  selectedCodes?: string[];
};

export function AirportField({
  label,
  multiple = false,
  value,
  onSelect,
  placeholder = "Enter an airport, city, or code",
  selectedCodes = []
}: AirportFieldProps) {
  const [query, setQuery] = useState(multiple ? "" : value);
  const [options, setOptions] = useState<AirportRecord[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isFocused, setIsFocused] = useState(false);
  const [hasCommittedSelection, setHasCommittedSelection] = useState(false);
  const deferredQuery = useDeferredValue(query);
  const trimmedQuery = query.trim();
  const selectedCodesLabel = selectedCodes.join(", ");
  const inputValue = multiple && !isFocused ? selectedCodesLabel : query;
  const suggestionOptions = options.slice(0, 6);
  const shouldShowSuggestions =
    isFocused &&
    !hasCommittedSelection &&
    trimmedQuery.length >= 2 &&
    suggestionOptions.length > 0;

  useEffect(() => {
    setQuery(multiple ? "" : value);
    setHasCommittedSelection(false);
  }, [multiple, value]);

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
    setQuery(multiple ? "" : airport.iata);
    setActiveIndex(0);
    setHasCommittedSelection(true);
    onSelect(airport.iata);
  }

  function commitTypedAirportCode(): boolean {
    if (!/^[A-Za-z]{3}$/u.test(trimmedQuery)) {
      return false;
    }

    const code = trimmedQuery.toUpperCase();
    setQuery(multiple ? "" : code);
    setActiveIndex(0);
    setHasCommittedSelection(true);
    onSelect(code);
    return true;
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" && shouldShowSuggestions) {
      event.preventDefault();
      setActiveIndex((current) =>
        Math.min(current + 1, suggestionOptions.length - 1)
      );
      return;
    }

    if (event.key === "ArrowUp" && shouldShowSuggestions) {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, 0));
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const match = suggestionOptions[activeIndex] ?? suggestionOptions[0];
      if (shouldShowSuggestions && match) {
        selectAirport(match);
        return;
      }

      commitTypedAirportCode();
      return;
    }

    if (event.key === "Escape" && shouldShowSuggestions) {
      setActiveIndex(0);
    }
  }

  return (
    <div className="field filter-field filter-field--airport">
      <label className="field-label">{label}</label>
      <div
        className={`autocomplete-shell airport-autocomplete-shell ${
          multiple ? "airport-autocomplete-shell--multiple" : ""
        }`}
      >
        <input
          aria-label={label}
          className={`airport-autocomplete-input ${
            multiple ? "airport-autocomplete-input--with-icon" : ""
          }`}
          value={inputValue}
          onBlur={() => {
            setIsFocused(false);
            if (multiple) {
              setQuery("");
            }
            setHasCommittedSelection(false);
          }}
          onChange={(event) => {
            const nextValue = event.target.value;
            setQuery(nextValue);
            setHasCommittedSelection(false);
          }}
          onFocus={() => {
            setIsFocused(true);
            if (multiple) {
              setQuery("");
            }
            setHasCommittedSelection(false);
          }}
          onKeyDown={handleInputKeyDown}
          placeholder={
            multiple && selectedCodesLabel ? selectedCodesLabel : placeholder
          }
        />
        {multiple ? (
          <button
            aria-label={`Select multiple ${label.toLowerCase()}`}
            className="airport-select-icon"
            onMouseDown={(event) => {
              event.preventDefault();
            }}
            onClick={(event) => {
              const input = event.currentTarget
                .previousElementSibling as HTMLInputElement | null;
              input?.focus();
            }}
            title={`Select multiple ${label.toLowerCase()}`}
            type="button"
          >
            <span aria-hidden="true" />
          </button>
        ) : null}
        {shouldShowSuggestions ? (
          <div
            className="suggestion-list"
            role="listbox"
            aria-label={`${label} matches`}
          >
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
                  <strong>{airport.iata} | {airport.city}</strong>
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
    </div>
  );
}
