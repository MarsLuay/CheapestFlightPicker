import axios, {
  isAxiosError,
  type AxiosRequestConfig,
  type AxiosResponse
} from "axios";

import { sleep } from "../../core/sleep";
import { getActiveSearchAbortSignal } from "./abort-context";
import {
  getGoogleFlightsWireErrorCode,
  isTransientGoogleFlightsWireErrorCode
} from "./wire";

const googleFlightsRequestTimeoutMs = 1000 * 45;
const googleFlightsPageUrl = "https://www.google.com/travel/flights";
const defaultGoogleFlightsRateLimitRetries = 2;
const defaultGoogleFlightsWireErrorRetries = 2;
const defaultGoogleFlightsRetryDelayMs = 800;
/** Cap concurrent Google Flights HTTP posts process-wide. */
const defaultGoogleFlightsMaxConcurrentPosts = 3;

type GoogleFlightsClientOptions = {
  maxConcurrentPosts?: number;
  maxRateLimitRetries?: number;
  maxWireErrorRetries?: number;
  request?: (config: AxiosRequestConfig<string>) => Promise<AxiosResponse>;
  retryDelayMs?: number;
};

export class GoogleFlightsRateLimitError extends Error {
  readonly statusCode = 429;

  constructor(
    message = "Google Flights temporarily rate limited this search. Wait a minute and try again. If this keeps happening, try turning on a VPN."
  ) {
    super(message);
    this.name = "GoogleFlightsRateLimitError";
  }
}

export class GoogleFlightsUnavailableError extends Error {
  readonly statusCode = 503;
  readonly wireErrorCode: number | null;

  constructor(
    wireErrorCode: number | null = null,
    message = "Google Flights rejected this search (temporary provider error). Wait a minute and try again. If this keeps happening, try a VPN or run the search later."
  ) {
    super(message);
    this.name = "GoogleFlightsUnavailableError";
    this.wireErrorCode = wireErrorCode;
  }
}

function isGoogleFlightsRateLimited(error: unknown): boolean {
  if (!isAxiosError(error)) {
    return false;
  }

  const statusCode =
    typeof error.response?.status === "number"
      ? error.response.status
      : undefined;
  if (statusCode === 429) {
    return true;
  }

  return /rate.?limit|too many requests|status code 429/iu.test(error.message);
}

function readRetryAfterMs(error: unknown): number | null {
  if (!isAxiosError(error)) {
    return null;
  }

  const header = error.response?.headers?.["retry-after"];
  if (typeof header !== "string" && typeof header !== "number") {
    return null;
  }

  const asSeconds = Number(header);
  if (Number.isFinite(asSeconds) && asSeconds >= 0) {
    return Math.min(asSeconds * 1000, 60_000);
  }

  return null;
}

class PostSemaphore {
  private active = 0;

  private readonly waiters: Array<() => void> = [];

  constructor(private readonly maxConcurrent: number) {}

  async acquire(signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) {
      throw new DOMException("The operation was aborted.", "AbortError");
    }

    if (this.active < this.maxConcurrent) {
      this.active += 1;
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const waiter = () => {
        signal?.removeEventListener("abort", onAbort);
        this.active += 1;
        resolve();
      };
      const onAbort = () => {
        const index = this.waiters.indexOf(waiter);
        if (index >= 0) {
          this.waiters.splice(index, 1);
        }
        reject(new DOMException("The operation was aborted.", "AbortError"));
      };

      this.waiters.push(waiter);
      signal?.addEventListener("abort", onAbort, { once: true });
    });
  }

  release(): void {
    this.active = Math.max(0, this.active - 1);
    const next = this.waiters.shift();
    if (next) {
      next();
    }
  }
}

const sharedPostSemaphore = new PostSemaphore(
  defaultGoogleFlightsMaxConcurrentPosts
);

export class GoogleFlightsClient {
  private readonly maxRateLimitRetries: number;

  private readonly maxWireErrorRetries: number;

  private readonly request: (
    config: AxiosRequestConfig<string>
  ) => Promise<AxiosResponse>;

  private readonly retryDelayMs: number;

  private readonly postSemaphore: PostSemaphore;

  private readonly headers = {
    "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36",
    accept: "*/*",
    "accept-language": "en-US,en;q=0.9",
    origin: "https://www.google.com",
    referer: "https://www.google.com/travel/flights",
    "x-same-domain": "1"
  };

  constructor(options?: GoogleFlightsClientOptions) {
    this.maxRateLimitRetries =
      options?.maxRateLimitRetries ?? defaultGoogleFlightsRateLimitRetries;
    this.maxWireErrorRetries =
      options?.maxWireErrorRetries ?? defaultGoogleFlightsWireErrorRetries;
    this.request = options?.request ?? axios;
    this.retryDelayMs =
      options?.retryDelayMs ?? defaultGoogleFlightsRetryDelayMs;
    this.postSemaphore =
      options?.maxConcurrentPosts && options.maxConcurrentPosts > 0
        ? new PostSemaphore(options.maxConcurrentPosts)
        : sharedPostSemaphore;
  }

  async getSearchPage(
    origin: string,
    destination: string,
    departureDate: string,
    returnDate?: string,
    signal?: AbortSignal
  ): Promise<string> {
    const effectiveSignal = signal ?? getActiveSearchAbortSignal();
    if (effectiveSignal?.aborted) {
      throw new DOMException("The operation was aborted.", "AbortError");
    }

    const query = `${origin}-${destination}-${departureDate}${returnDate ? `*${returnDate}` : ""}`;
    const url = `${googleFlightsPageUrl}?q=${encodeURIComponent(query)}&hl=en&curr=USD`;
    await this.postSemaphore.acquire(effectiveSignal);
    try {
      const response = await this.request({
        headers: {
          accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "accept-language": "en-US,en;q=0.9",
          referer: googleFlightsPageUrl,
          "user-agent": this.headers["user-agent"]
        },
        method: "GET",
        signal: effectiveSignal,
        timeout: googleFlightsRequestTimeoutMs,
        url
      });
      return typeof response.data === "string"
        ? response.data
        : JSON.stringify(response.data);
    } finally {
      this.postSemaphore.release();
    }
  }

  async post(url: string, data: string, signal?: AbortSignal): Promise<string> {
    const effectiveSignal = signal ?? getActiveSearchAbortSignal();
    if (effectiveSignal?.aborted) {
      throw new DOMException("The operation was aborted.", "AbortError");
    }

    const config: AxiosRequestConfig<string> = {
      data,
      headers: this.headers,
      method: "POST",
      signal: effectiveSignal,
      timeout: googleFlightsRequestTimeoutMs,
      url
    };

    let rateLimitAttempt = 0;
    let wireErrorAttempt = 0;
    await this.postSemaphore.acquire(effectiveSignal);

    try {
      while (true) {
        try {
          const response = await this.request(config);
          const body =
            typeof response.data === "string"
              ? response.data
              : JSON.stringify(response.data);
          const wireErrorCode = getGoogleFlightsWireErrorCode(body);
          if (wireErrorCode == null) {
            return body;
          }

          if (
            !isTransientGoogleFlightsWireErrorCode(wireErrorCode) ||
            wireErrorAttempt >= this.maxWireErrorRetries
          ) {
            throw new GoogleFlightsUnavailableError(wireErrorCode);
          }

          wireErrorAttempt += 1;
          await sleep(this.retryDelayMs * wireErrorAttempt, effectiveSignal);
        } catch (error) {
          if (error instanceof GoogleFlightsUnavailableError) {
            throw error;
          }

          if (effectiveSignal?.aborted) {
            throw error;
          }

          if (!isGoogleFlightsRateLimited(error)) {
            throw error;
          }

          if (rateLimitAttempt >= this.maxRateLimitRetries) {
            throw new GoogleFlightsRateLimitError();
          }

          rateLimitAttempt += 1;
          const retryAfterMs = readRetryAfterMs(error);
          await sleep(
            retryAfterMs ?? this.retryDelayMs * rateLimitAttempt,
            effectiveSignal
          );
        }
      }
    } finally {
      this.postSemaphore.release();
    }
  }
}

export function createGoogleFlightsClient(): GoogleFlightsClient {
  return new GoogleFlightsClient();
}
