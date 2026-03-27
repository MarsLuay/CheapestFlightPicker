import type { SearchRequest } from "./types";

const nextCabinByClass: Record<
  SearchRequest["cabinClass"],
  SearchRequest["cabinClass"] | null
> = {
  economy: "premium_economy",
  premium_economy: "business",
  business: "first",
  first: null
};

const cabinLabels: Record<SearchRequest["cabinClass"], string> = {
  economy: "Economy",
  premium_economy: "Premium Economy",
  business: "Business",
  first: "First"
};

export function getCabinLabel(cabinClass: SearchRequest["cabinClass"]): string {
  return cabinLabels[cabinClass];
}

export function getNextCabinClass(
  cabinClass: SearchRequest["cabinClass"]
): SearchRequest["cabinClass"] | null {
  return nextCabinByClass[cabinClass];
}

export function buildAdjacentCabinSearchRequest(
  request: SearchRequest
): SearchRequest | null {
  const nextCabinClass = getNextCabinClass(request.cabinClass);
  if (!nextCabinClass) {
    return null;
  }

  return {
    ...request,
    cabinClass: nextCabinClass
  };
}

export function buildAdjacentCabinBoxTitle(
  cabinClass: SearchRequest["cabinClass"]
): string {
  return `Overall Cheapest ${getCabinLabel(
    getNextCabinClass(cabinClass) ?? cabinClass
  )}`;
}
