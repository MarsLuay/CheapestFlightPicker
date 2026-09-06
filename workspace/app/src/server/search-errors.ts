import { isAxiosError } from "axios";

import {
  GoogleFlightsRateLimitError,
  GoogleFlightsUnavailableError
} from "../providers/google-flights/client";

export type SearchFailureResponse = {
  message: string;
  statusCode: number;
};

const upstreamRateLimitMessage =
  "The flight search provider temporarily rate limited this search. Wait a minute and try again. If this keeps happening, try turning on a VPN.";
const upstreamNetworkMessage =
  "The flight search provider could not be reached. Check your internet connection, DNS settings, VPN, or proxy, then try again.";

function isUpstreamNetworkError(error: unknown): boolean {
  if (!isAxiosError(error)) {
    return false;
  }

  if (error.response) {
    return false;
  }

  const code = typeof error.code === "string" ? error.code : "";
  if (
    [
      "EAI_AGAIN",
      "ECONNABORTED",
      "ECONNREFUSED",
      "ECONNRESET",
      "ENOTFOUND",
      "ETIMEDOUT"
    ].includes(code)
  ) {
    return true;
  }

  return /getaddrinfo|network error|timeout|timed out|dns/iu.test(
    error.message
  );
}

export function getSearchFailureResponse(
  error: unknown
): SearchFailureResponse {
  if (error instanceof GoogleFlightsRateLimitError) {
    return {
      message: error.message,
      statusCode: error.statusCode
    };
  }

  if (error instanceof GoogleFlightsUnavailableError) {
    return {
      message: error.message,
      statusCode: error.statusCode
    };
  }

  if (isAxiosError(error) && error.response?.status === 429) {
    return {
      message: upstreamRateLimitMessage,
      statusCode: 429
    };
  }

  if (isUpstreamNetworkError(error)) {
    return {
      message: upstreamNetworkMessage,
      statusCode: 503
    };
  }

  return {
    message: error instanceof Error ? error.message : "Search failed",
    statusCode: 400
  };
}
