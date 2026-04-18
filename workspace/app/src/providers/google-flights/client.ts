import axios, {
  isAxiosError,
  type AxiosRequestConfig,
  type AxiosResponse
} from "axios";

const googleFlightsRequestTimeoutMs = 1000 * 45;
const defaultGoogleFlightsRateLimitRetries = 2;
const defaultGoogleFlightsRetryDelayMs = 800;

type GoogleFlightsClientOptions = {
  maxRateLimitRetries?: number;
  request?: (config: AxiosRequestConfig<string>) => Promise<AxiosResponse>;
  retryDelayMs?: number;
};

export class GoogleFlightsRateLimitError extends Error {
  readonly statusCode = 429;

  constructor(message = "Google Flights temporarily rate limited this search. Wait a minute and try again.") {
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

function sleep(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (delayMs <= 0) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal?.removeEventListener("abort", handleAbort);
      resolve();
    }, delayMs);

    function handleAbort() {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", handleAbort);
      reject(new DOMException("Aborted", "AbortError"));
    }

    if (signal?.aborted) {
      handleAbort();
      return;
    }

    signal?.addEventListener("abort", handleAbort, { once: true });
  });
}

export class GoogleFlightsClient {
  private readonly maxRateLimitRetries: number;

  private readonly request: (
    config: AxiosRequestConfig<string>
  ) => Promise<AxiosResponse>;

  private readonly retryDelayMs: number;

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
  }

  async post(url: string, data: string, signal?: AbortSignal): Promise<string> {
    const config: AxiosRequestConfig<string> = {
      data,
      headers: this.headers,
      method: "POST",
      signal,
      timeout: googleFlightsRequestTimeoutMs,
      url
    };

    let attempt = 0;

    while (true) {
      try {
        const response = await this.request(config);
        return typeof response.data === "string"
          ? response.data
          : JSON.stringify(response.data);
      } catch (error) {
        if (!isGoogleFlightsRateLimited(error)) {
          throw error;
        }

        if (attempt >= this.maxRateLimitRetries) {
          throw new GoogleFlightsRateLimitError();
        }

        attempt += 1;
        await sleep(this.retryDelayMs * attempt, signal);
      }
    }
  }
}

export function createGoogleFlightsClient(): GoogleFlightsClient {
  return new GoogleFlightsClient();
}
