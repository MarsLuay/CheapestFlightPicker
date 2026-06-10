import { createAmadeusFlightSearchProviderFromEnv } from "../providers/amadeus/provider";
import { GoogleFlightsProvider } from "../providers/google-flights/provider";
import type { ExactFlightSearchParams } from "../providers/google-flights/types";
import type { DatePrice, FlightOption, SearchRequest } from "../shared/types";

export type SearchProviderRuntimeOptions = {
  bypassCache?: boolean;
};

export interface FlightSearchProvider {
  searchExactFlights(
    params: ExactFlightSearchParams,
    runtimeOptions?: SearchProviderRuntimeOptions
  ): Promise<FlightOption[]>;
  searchOneWayWithinWindow(
    request: SearchRequest,
    origin: string,
    destination: string,
    fromDate: string,
    toDate: string
  ): Promise<DatePrice[]>;
}

const hostedProviderConfigurationMessage =
  "Hosted search is not configured yet. Google Flights rate limits Vercel/serverless traffic, so add AMADEUS_CLIENT_ID and AMADEUS_CLIENT_SECRET to the Vercel project env vars or run the app locally.";

function isVercelRuntime(): boolean {
  return process.env.VERCEL === "1" || process.env.VERCEL === "true";
}

function getConfiguredSearchProvider():
  | "amadeus"
  | "auto"
  | "google" {
  const rawValue = process.env.SEARCH_PROVIDER?.trim().toLowerCase();

  if (rawValue === "amadeus" || rawValue === "google") {
    return rawValue;
  }

  return "auto";
}

class UnavailableHostedSearchProvider implements FlightSearchProvider {
  constructor(private readonly message: string) {}

  async searchExactFlights(
    _params: ExactFlightSearchParams,
    _runtimeOptions?: SearchProviderRuntimeOptions
  ): Promise<FlightOption[]> {
    throw new Error(this.message);
  }

  async searchOneWayWithinWindow(
    _request: SearchRequest,
    _origin: string,
    _destination: string,
    _fromDate: string,
    _toDate: string
  ): Promise<DatePrice[]> {
    throw new Error(this.message);
  }
}

export function createFlightSearchProvider(): FlightSearchProvider {
  const configuredProvider = getConfiguredSearchProvider();

  if (configuredProvider === "google") {
    return new GoogleFlightsProvider();
  }

  const amadeusProvider = createAmadeusFlightSearchProviderFromEnv();
  if (configuredProvider === "amadeus") {
    return (
      amadeusProvider ??
      new UnavailableHostedSearchProvider(hostedProviderConfigurationMessage)
    );
  }

  if (isVercelRuntime()) {
    return (
      amadeusProvider ??
      new UnavailableHostedSearchProvider(hostedProviderConfigurationMessage)
    );
  }

  return new GoogleFlightsProvider();
}
