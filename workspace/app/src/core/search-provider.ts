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

export function createFlightSearchProvider(): FlightSearchProvider {
  return new GoogleFlightsProvider();
}
