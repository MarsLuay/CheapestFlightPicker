export type AmadeusAccessTokenResponse = {
  access_token: string;
  expires_in: number;
};

export type AmadeusFlightOfferSearchParams = {
  originLocationCode: string;
  destinationLocationCode: string;
  departureDate: string;
  returnDate?: string;
  adults: number;
  children?: number;
  infants?: number;
  currencyCode?: string;
  max?: number;
  nonStop?: boolean;
  travelClass?: "ECONOMY" | "PREMIUM_ECONOMY" | "BUSINESS" | "FIRST";
  includedAirlineCodes?: string;
};

export type AmadeusFlightOfferPrice = {
  currency?: string;
  total?: string;
  grandTotal?: string;
};

export type AmadeusItineraryPriceMetricsParams = {
  originIataCode: string;
  destinationIataCode: string;
  departureDate: string;
  currencyCode?: string;
  oneWay?: boolean;
};

export type AmadeusItineraryPriceMetric = {
  amount?: string;
  quartileRanking?:
    | "MINIMUM"
    | "FIRST"
    | "MEDIUM"
    | "THIRD"
    | "MAXIMUM"
    | string;
};

export type AmadeusItineraryPriceMetricsEntry = {
  priceMetrics?: AmadeusItineraryPriceMetric[];
};

export type AmadeusItineraryPriceMetricsResponse = {
  data?: AmadeusItineraryPriceMetricsEntry[];
};

export type AmadeusFlightOfferSegment = {
  departure?: {
    iataCode?: string;
    at?: string;
  };
  arrival?: {
    iataCode?: string;
    at?: string;
  };
  carrierCode?: string;
  number?: string;
  operating?: {
    carrierCode?: string;
  };
  duration?: string;
};

export type AmadeusFlightOffer = {
  itineraries?: Array<{
    duration?: string;
    segments?: AmadeusFlightOfferSegment[];
  }>;
  validatingAirlineCodes?: string[];
  lastTicketingDate?: string;
  numberOfBookableSeats?: number;
  price?: AmadeusFlightOfferPrice;
};

export type AmadeusFlightOffersResponse = {
  data?: AmadeusFlightOffer[];
};
