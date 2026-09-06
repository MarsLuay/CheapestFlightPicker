import { describe, expect, it } from "vitest";

import {
  GoogleFlightsRateLimitError,
  GoogleFlightsUnavailableError
} from "../providers/google-flights/client";
import { getSearchFailureResponse } from "./search-errors";

function buildAxiosError(
  statusCode: number,
  message = `Request failed with status code ${statusCode}`
): Error & {
  isAxiosError: true;
  response: {
    status: number;
  };
} {
  const error = new Error(message) as Error & {
    isAxiosError: true;
    response: {
      status: number;
    };
  };

  error.isAxiosError = true;
  error.response = {
    status: statusCode
  };

  return error;
}

function buildAxiosNetworkError(
  code: string,
  message: string
): Error & {
  code: string;
  isAxiosError: true;
} {
  const error = new Error(message) as Error & {
    code: string;
    isAxiosError: true;
  };

  error.code = code;
  error.isAxiosError = true;

  return error;
}

describe("getSearchFailureResponse", () => {
  it("preserves the friendly Google Flights rate-limit response", () => {
    expect(
      getSearchFailureResponse(new GoogleFlightsRateLimitError())
    ).toEqual({
      message:
        "Google Flights temporarily rate limited this search. Wait a minute and try again. If this keeps happening, try turning on a VPN.",
      statusCode: 429
    });
  });

  it("preserves the friendly Google Flights unavailable wire-error response", () => {
    expect(
      getSearchFailureResponse(new GoogleFlightsUnavailableError(13))
    ).toEqual({
      message:
        "Google Flights rejected this search (temporary provider error). Wait a minute and try again. If this keeps happening, try a VPN or run the search later.",
      statusCode: 503
    });
  });

  it("maps raw upstream 429 errors to a friendly search error", () => {
    expect(getSearchFailureResponse(buildAxiosError(429))).toEqual({
      message:
        "The flight search provider temporarily rate limited this search. Wait a minute and try again. If this keeps happening, try turning on a VPN.",
      statusCode: 429
    });
  });

  it("maps DNS failures to a friendly provider connectivity error", () => {
    expect(
      getSearchFailureResponse(
        buildAxiosNetworkError(
          "ENOTFOUND",
          "getaddrinfo ENOTFOUND www.google.com"
        )
      )
    ).toEqual({
      message:
        "The flight search provider could not be reached. Check your internet connection, DNS settings, VPN, or proxy, then try again.",
      statusCode: 503
    });
  });

  it("keeps non-rate-limit errors as bad requests", () => {
    expect(getSearchFailureResponse(new Error("Invalid route"))).toEqual({
      message: "Invalid route",
      statusCode: 400
    });
  });
});
