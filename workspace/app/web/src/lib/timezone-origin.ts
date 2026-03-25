export type TimeZoneOriginMatch = {
  origin: string;
  regionLabel: string;
  timeZone: string;
};

const timeZoneOriginRules: Array<{
  airport: string;
  pattern: RegExp;
  regionLabel: string;
}> = [
  {
    airport: "HNL",
    pattern: /^Pacific\/Honolulu$/u,
    regionLabel: "Hawaii"
  },
  {
    airport: "ANC",
    pattern: /^America\/Anchorage$/u,
    regionLabel: "Alaska"
  },
  {
    airport: "PHX",
    pattern: /^America\/Phoenix$/u,
    regionLabel: "Arizona"
  },
  {
    airport: "DEN",
    pattern:
      /^America\/(Denver|Boise|Edmonton|Yellowknife|Cambridge_Bay)$/u,
    regionLabel: "Mountain Time"
  },
  {
    airport: "ORD",
    pattern:
      /^America\/(Chicago|Winnipeg|Resolute|Rankin_Inlet|Mexico_City|Matamoros|Monterrey|Merida|Guatemala|Belize|Managua|El_Salvador|Tegucigalpa|Costa_Rica)$/u,
    regionLabel: "Central Time"
  },
  {
    airport: "JFK",
    pattern:
      /^America\/(New_York|Detroit|Toronto|Montreal|Nipigon|Thunder_Bay|Iqaluit|Pangnirtung|Indiana\/.+|Kentucky\/.+|Louisville|Indianapolis|Nassau|Cancun|Panama|Bogota|Lima|Port-au-Prince|Grand_Turk)$/u,
    regionLabel: "Eastern Time"
  },
  {
    airport: "LAX",
    pattern: /^America\/(Los_Angeles|Vancouver|Whitehorse|Tijuana)$/u,
    regionLabel: "Pacific Time"
  }
];

export function getBrowserTimeZone(): string | null {
  if (typeof Intl === "undefined") {
    return null;
  }

  try {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof timeZone === "string" && timeZone ? timeZone : null;
  } catch {
    return null;
  }
}

export function inferOriginFromTimeZone(
  timeZone: string | null | undefined
): TimeZoneOriginMatch | null {
  if (typeof timeZone !== "string" || !timeZone) {
    return null;
  }

  const match = timeZoneOriginRules.find((rule) => rule.pattern.test(timeZone));
  if (!match) {
    return null;
  }

  return {
    origin: match.airport,
    regionLabel: match.regionLabel,
    timeZone
  };
}
