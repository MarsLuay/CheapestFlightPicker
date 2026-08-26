import type { FlightOption, SearchRequest } from "./types";

const cabinOrder: SearchRequest["cabinClass"][] = [
  "economy",
  "premium_economy",
  "business",
  "first"
];

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

export function getHigherCabinClasses(
  cabinClass: SearchRequest["cabinClass"]
): SearchRequest["cabinClass"][] {
  const cabinIndex = cabinOrder.indexOf(cabinClass);
  return cabinIndex < 0 ? [] : cabinOrder.slice(cabinIndex + 1);
}

export function buildHigherCabinSearchRequests(
  request: SearchRequest
): SearchRequest[] {
  return getHigherCabinClasses(request.cabinClass).map((cabinClass) => ({
    ...request,
    cabinClass,
    maxResults: 3
  }));
}

export function pickCheaperFlightOption(
  current: FlightOption | null,
  next: FlightOption | null
): FlightOption | null {
  if (!current) {
    return next;
  }

  if (!next) {
    return current;
  }

  return next.totalPrice < current.totalPrice ? next : current;
}

export function buildHigherCabinBoxTitle(
  cabinClass: SearchRequest["cabinClass"]
): string {
  const nextCabinClass = getNextCabinClass(cabinClass);
  if (!nextCabinClass) {
    return `Overall Cheapest ${getCabinLabel(cabinClass)}`;
  }

  const higherCabinSuffix =
    getHigherCabinClasses(cabinClass).length > 1 ? " or Higher" : "";
  return `Overall Cheapest ${getCabinLabel(nextCabinClass)}${higherCabinSuffix}`;
}
