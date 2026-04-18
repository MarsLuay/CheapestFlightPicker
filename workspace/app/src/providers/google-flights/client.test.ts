import type { AxiosRequestConfig, AxiosResponse } from "axios";
import { describe, expect, it, vi } from "vitest";

import {
  GoogleFlightsClient,
  GoogleFlightsRateLimitError
} from "./client";

type RequestFn = (
  config: AxiosRequestConfig<string>
) => Promise<AxiosResponse>;

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

describe("GoogleFlightsClient", () => {
  it("retries rate-limited requests and returns the eventual response", async () => {
    const request = vi
      .fn<RequestFn>()
      .mockRejectedValueOnce(buildAxiosError(429))
      .mockResolvedValueOnce({
        data: "ok"
      } as AxiosResponse);
    const client = new GoogleFlightsClient({
      maxRateLimitRetries: 1,
      request,
      retryDelayMs: 0
    });

    await expect(
      client.post("https://example.com/shopping", "f.req=payload")
    ).resolves.toBe("ok");
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("throws a friendly rate-limit error after exhausting retries", async () => {
    const request = vi.fn<RequestFn>().mockRejectedValue(buildAxiosError(429));
    const client = new GoogleFlightsClient({
      maxRateLimitRetries: 1,
      request,
      retryDelayMs: 0
    });

    await expect(
      client.post("https://example.com/shopping", "f.req=payload")
    ).rejects.toMatchObject({
      message:
        "Google Flights temporarily rate limited this search. Wait a minute and try again.",
      name: "GoogleFlightsRateLimitError",
      statusCode: 429
    });
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("rethrows non-rate-limit failures unchanged", async () => {
    const error = new Error("boom");
    const request = vi.fn<RequestFn>().mockRejectedValue(error);
    const client = new GoogleFlightsClient({
      request,
      retryDelayMs: 0
    });

    await expect(
      client.post("https://example.com/shopping", "f.req=payload")
    ).rejects.toBe(error);
    expect(request).toHaveBeenCalledTimes(1);
  });
});
