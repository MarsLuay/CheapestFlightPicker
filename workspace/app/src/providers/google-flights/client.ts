import axios, { type AxiosRequestConfig } from "axios";

const googleFlightsRequestTimeoutMs = 1000 * 45;

export class GoogleFlightsClient {
  private readonly headers = {
    "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36"
  };

  async post(url: string, data: string, signal?: AbortSignal): Promise<string> {
    const config: AxiosRequestConfig<string> = {
      data,
      headers: this.headers,
      method: "POST",
      signal,
      timeout: googleFlightsRequestTimeoutMs,
      url
    };

    const response = await axios(config);
    return typeof response.data === "string"
      ? response.data
      : JSON.stringify(response.data);
  }
}

export function createGoogleFlightsClient(): GoogleFlightsClient {
  return new GoogleFlightsClient();
}
