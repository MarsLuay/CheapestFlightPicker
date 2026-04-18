import { isAxiosError } from "axios";

import { GoogleFlightsRateLimitError } from "../providers/google-flights/client";

export type SearchFailureResponse = {
  message: string;
  statusCode: number;
};

const upstreamRateLimitMessage =
  "The flight search provider temporarily rate limited this search. Wait a minute and try again.";

export function getSearchFailureResponse(
  error: unknown
): SearchFailureResponse {
  if (error instanceof GoogleFlightsRateLimitError) {
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

  return {
    message: error instanceof Error ? error.message : "Search failed",
    statusCode: 400
  };
}
