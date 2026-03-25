import {
  useDeferredValue,
  useEffect,
  useState,
  type KeyboardEvent
} from "react";

import { searchAirlines } from "../lib/api";
import type { AirlineRecord } from "../lib/types";

type AirlinePickerProps = {
  selected: string[];
  onChange: (codes: string[]) => void;
};

export function AirlinePicker({ selected, onChange }: AirlinePickerProps) {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<AirlineRecord[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isFocused, setIsFocused] = useState(false);
  const deferredQuery = useDeferredValue(query);
  const trimmedQuery = query.trim();
  const visibleOptions = options.filter(
    (airline) => !selected.includes(airline.iata)
  );
  const suggestionOptions = visibleOptions.slice(0, 6);
  const shouldShowSuggestions =
    isFocused && trimmedQuery.length > 0 && suggestionOptions.length > 0;

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const airlines = await searchAirlines(deferredQuery);
      if (!cancelled) {
        setOptions(airlines);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [deferredQuery]);

  useEffect(() => {
    setActiveIndex(0);
  }, [trimmedQuery, options, selected]);

  function addAirline(code: string) {
    if (selected.includes(code)) {
      return;
    }

    onChange([...selected, code]);
    setQuery("");
    setActiveIndex(0);
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
        addAirline(match.iata);
      }

      if (event.key === "Enter") {
        event.preventDefault();
      }
      return;
    }

    if (event.key === "Escape") {
      setQuery("");
      setActiveIndex(0);
    }
  }

  return (
    <div className="field filter-field filter-field--wide">
      <span>Airlines</span>
      <div className="autocomplete-shell">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          onKeyDown={handleInputKeyDown}
          placeholder="Leave blank for any"
        />
        {shouldShowSuggestions ? (
          <div className="suggestion-list" role="listbox" aria-label="Airline matches">
            {suggestionOptions.map((airline, index) => (
              <button
                key={airline.id}
                className={`suggestion-option ${
                  index === activeIndex ? "is-active" : ""
                }`}
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault();
                  addAirline(airline.iata);
                }}
              >
                <span className="suggestion-copy">
                  <strong>{airline.iata}</strong>
                  <span>{airline.name}</span>
                </span>
                {index === 0 ? (
                  <span className="suggestion-badge">Best match</span>
                ) : null}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div className="chip-row">
        {selected.map((code) => (
          <button
            key={code}
            className="chip"
            type="button"
            onClick={() => onChange(selected.filter((entry) => entry !== code))}
          >
            {code} x
          </button>
        ))}
      </div>
    </div>
  );
}
