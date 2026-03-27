import type { FlightOption } from "../shared/types";

const economyCarryOnRestrictedAirlines = new Set([
  "F9",
  "G4",
  "NK",
  "SY",
  "XP"
]);

export function getOptionAirlineCodes(option: FlightOption): string[] {
  const codes = new Set<string>();

  for (const slice of option.slices) {
    for (const leg of slice.legs) {
      if (leg.airlineCode) {
        codes.add(leg.airlineCode);
      }
    }
  }

  return [...codes].sort();
}

export function isNonstopOption(option: FlightOption): boolean {
  return option.slices.length > 0 && option.slices.every((slice) => slice.stops === 0);
}

export function optionAppearsToIncludeFreeCarryOnBag(
  option: FlightOption,
  cabinClass: string
): boolean {
  if (cabinClass !== "economy") {
    return true;
  }

  const airlineCodes = getOptionAirlineCodes(option);
  if (airlineCodes.length === 0) {
    return true;
  }

  return airlineCodes.every(
    (airlineCode) => !economyCarryOnRestrictedAirlines.has(airlineCode)
  );
}
