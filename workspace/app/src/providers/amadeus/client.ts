import axios from "axios";

import type {
  AmadeusAccessTokenResponse,
  AmadeusFlightOffer,
  AmadeusFlightOfferSearchParams,
  AmadeusFlightOffersResponse,
  AmadeusItineraryPriceMetricsEntry,
  AmadeusItineraryPriceMetricsParams,
  AmadeusItineraryPriceMetricsResponse
} from "./types";

type AmadeusClientOptions = {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
};

type AccessTokenCache = {
  accessToken: string;
  expiresAt: number;
};

const tokenRefreshBufferMs = 60 * 1000;

export class AmadeusClient {
  private accessTokenCache: AccessTokenCache | null = null;

  constructor(private readonly options: AmadeusClientOptions) {}

  async searchFlightOffers(
    params: AmadeusFlightOfferSearchParams
  ): Promise<AmadeusFlightOffer[]> {
    const accessToken = await this.getAccessToken();
    const response = await axios.get<AmadeusFlightOffersResponse>(
      `${this.options.baseUrl}/v2/shopping/flight-offers`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`
        },
        params,
        timeout: 1000 * 20
      }
    );

    return Array.isArray(response.data.data) ? response.data.data : [];
  }

  async getItineraryPriceMetrics(
    params: AmadeusItineraryPriceMetricsParams
  ): Promise<AmadeusItineraryPriceMetricsEntry[]> {
    const accessToken = await this.getAccessToken();
    const response = await axios.get<AmadeusItineraryPriceMetricsResponse>(
      `${this.options.baseUrl}/v1/analytics/itinerary-price-metrics`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`
        },
        params,
        timeout: 1000 * 20
      }
    );

    return Array.isArray(response.data.data) ? response.data.data : [];
  }

  private async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (
      this.accessTokenCache &&
      this.accessTokenCache.expiresAt - tokenRefreshBufferMs > now
    ) {
      return this.accessTokenCache.accessToken;
    }

    const body = new URLSearchParams({
      client_id: this.options.clientId,
      client_secret: this.options.clientSecret,
      grant_type: "client_credentials"
    });

    const response = await axios.post<AmadeusAccessTokenResponse>(
      `${this.options.baseUrl}/v1/security/oauth2/token`,
      body.toString(),
      {
        headers: {
          "content-type": "application/x-www-form-urlencoded"
        },
        timeout: 1000 * 20
      }
    );

    const accessToken = response.data.access_token;
    const expiresInSeconds = response.data.expires_in;
    if (
      typeof accessToken !== "string" ||
      !accessToken ||
      typeof expiresInSeconds !== "number"
    ) {
      throw new Error("Amadeus access token response was incomplete");
    }

    this.accessTokenCache = {
      accessToken,
      expiresAt: now + expiresInSeconds * 1000
    };

    return accessToken;
  }
}

export function createAmadeusClientFromEnv(): AmadeusClient | null {
  if (process.env.VITEST) {
    return null;
  }

  const clientId = process.env.AMADEUS_CLIENT_ID?.trim();
  const clientSecret = process.env.AMADEUS_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    return null;
  }

  const baseUrl =
    process.env.AMADEUS_BASE_URL?.trim() || "https://api.amadeus.com";

  return new AmadeusClient({
    baseUrl,
    clientId,
    clientSecret
  });
}
