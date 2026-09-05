import {
  useDeferredValue,
  useEffect,
  useReducer,
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

/** Accept a raw typed IATA code (blur/Enter) without requiring a suggestion click. */
export function parseTypedAirportCode(query: string): string | null {
  const trimmed = query.trim();
  if (!/^[A-Za-z]{3}$/u.test(trimmed)) {
    return null;
  }

  return trimmed.toUpperCase();
}

type State = {
  query: string;
  options: AirportRecord[];
  activeIndex: number;
  isFocused: boolean;
  hasCommittedSelection: boolean;
};

type Action =
  | { type: "SET_QUERY"; payload: string }
  | { type: "SET_OPTIONS"; payload: AirportRecord[] }
  | { type: "FOCUS"; payload: { multiple: boolean } }
  | { type: "BLUR"; payload: { committed: boolean; multiple: boolean; value: string } }
  | { type: "SELECT"; payload: { multiple: boolean; code: string } }
  | { type: "SET_ACTIVE_INDEX"; payload: number | ((current: number) => number) }
  | { type: "SYNC_PROPS"; payload: { multiple: boolean; value: string } };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "SET_QUERY":
      return {
        ...state,
        query: action.payload,
        hasCommittedSelection: false,
        activeIndex: 0
      };
    case "SET_OPTIONS":
      return {
        ...state,
        options: action.payload,
        activeIndex: 0
      };
    case "FOCUS":
      return {
        ...state,
        isFocused: true,
        query: action.payload.multiple ? "" : state.query,
        hasCommittedSelection: false
      };
    case "BLUR": {
      const { committed, multiple, value } = action.payload;
      let nextQuery = state.query;
      if (multiple && !committed) {
        nextQuery = "";
      } else if (!multiple && !committed) {
        nextQuery = value;
      }
      return {
        ...state,
        isFocused: false,
        query: nextQuery,
        hasCommittedSelection: false
      };
    }
    case "SELECT":
      return {
        ...state,
        query: action.payload.multiple ? "" : action.payload.code,
        activeIndex: 0,
        hasCommittedSelection: true
      };
    case "SET_ACTIVE_INDEX":
      return {
        ...state,
        activeIndex:
          typeof action.payload === "function"
            ? action.payload(state.activeIndex)
            : action.payload
      };
    case "SYNC_PROPS": {
      const { multiple, value } = action.payload;
      const nextQuery = multiple ? "" : value;
      if (state.query === nextQuery && !state.hasCommittedSelection) {
        return state;
      }
      return {
        ...state,
        query: nextQuery,
        hasCommittedSelection: false
      };
    }
    default:
      return state;
  }
}

export function AirportField({
  label,
  multiple = false,
  value,
  onSelect,
  placeholder = "Enter an airport, city, or code",
  selectedCodes = []
}: AirportFieldProps) {
  const [state, dispatch] = useReducer(reducer, {
    query: multiple ? "" : value,
    options: [],
    activeIndex: 0,
    isFocused: false,
    hasCommittedSelection: false
  });

  const { query, options, activeIndex, isFocused, hasCommittedSelection } = state;

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
    dispatch({ type: "SYNC_PROPS", payload: { multiple, value } });
  }, [multiple, value]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (deferredQuery.trim().length < 2) {
        dispatch({ type: "SET_OPTIONS", payload: [] });
        return;
      }

      const airports = await searchAirports(deferredQuery);
      if (!cancelled) {
        dispatch({ type: "SET_OPTIONS", payload: airports });
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [deferredQuery]);

  function selectAirport(airport: AirportRecord) {
    dispatch({ type: "SELECT", payload: { multiple, code: airport.iata } });
    onSelect(airport.iata);
  }

  function commitTypedAirportCode(rawQuery = trimmedQuery): boolean {
    const code = parseTypedAirportCode(rawQuery);
    if (!code) {
      return false;
    }

    dispatch({ type: "SELECT", payload: { multiple, code } });
    onSelect(code);
    return true;
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" && shouldShowSuggestions) {
      event.preventDefault();
      dispatch({
        type: "SET_ACTIVE_INDEX",
        payload: (current) => Math.min(current + 1, suggestionOptions.length - 1)
      });
      return;
    }

    if (event.key === "ArrowUp" && shouldShowSuggestions) {
      event.preventDefault();
      dispatch({
        type: "SET_ACTIVE_INDEX",
        payload: (current) => Math.max(current - 1, 0)
      });
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
      dispatch({ type: "SET_ACTIVE_INDEX", payload: 0 });
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
            const committed = commitTypedAirportCode();
            dispatch({ type: "BLUR", payload: { committed, multiple, value } });
          }}
          onChange={(event) => {
            dispatch({ type: "SET_QUERY", payload: event.target.value });
          }}
          onFocus={() => {
            dispatch({ type: "FOCUS", payload: { multiple } });
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
