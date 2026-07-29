import axios, {
  isAxiosError,
  type AxiosRequestConfig,
  type AxiosResponse
} from "axios";

import { sleep } from "../../core/sleep";
import { getActiveSearchAbortSignal } from "./abort-context";

const googleFlightsRequestTimeoutMs = 1000 * 45;
const defaultGoogleFlightsRateLimitRetries = 2;
const defaultGoogleFlightsRetryDelayMs = 800;
/** Cap concurrent Google Flights HTTP posts process-wide. */
const defaultGoogleFlightsMaxConcurrentPosts = 3;

type GoogleFlightsClientOptions = {
  maxConcurrentPosts?: number;
  maxRateLimitRetries?: number;
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

  private readonly request: (
    config: AxiosRequestConfig<string>
  ) => Promise<AxiosResponse>;

  private readonly retryDelayMs: number;

  private readonly postSemaphore: PostSemaphore;

  private readonly headers = {
    "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36"
  };

  constructor(options?: GoogleFlightsClientOptions) {
    this.maxRateLimitRetries =
      options?.maxRateLimitRetries ?? defaultGoogleFlightsRateLimitRetries;
    this.request = options?.request ?? axios;
    this.retryDelayMs =
      options?.retryDelayMs ?? defaultGoogleFlightsRetryDelayMs;
    this.postSemaphore =
      options?.maxConcurrentPosts && options.maxConcurrentPosts > 0
        ? new PostSemaphore(options.maxConcurrentPosts)
        : sharedPostSemaphore;
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

    let attempt = 0;
    await this.postSemaphore.acquire(effectiveSignal);

    try {
      while (true) {
        try {
          const response = await this.request(config);
          return typeof response.data === "string"
            ? response.data
            : JSON.stringify(response.data);
        } catch (error) {
          if (effectiveSignal?.aborted) {
            throw error;
          }

          if (!isGoogleFlightsRateLimited(error)) {
            throw error;
          }

          if (attempt >= this.maxRateLimitRetries) {
            throw new GoogleFlightsRateLimitError();
          }

          attempt += 1;
          const retryAfterMs = readRetryAfterMs(error);
          await sleep(
            retryAfterMs ?? this.retryDelayMs * attempt,
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
