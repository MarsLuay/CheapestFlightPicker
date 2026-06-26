import airportsCsvUrl from "../../../data/airports.csv?url";
import airlinesCsvUrl from "../../../data/airlines.csv?url";

import type { AirlineRecord, AirportRecord } from "./types";

let airportsPromise: Promise<AirportRecord[]> | null = null;
let airlinesPromise: Promise<AirlineRecord[]> | null = null;

function sanitizeCatalogText(value: string): string {
  return value
    // eslint-disable-next-line no-control-regex -- intentionally strip control characters from CSV catalog data
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu, "")
    .trim();
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (char === "\"") {
      const nextChar = line[index + 1];
      if (inQuotes && nextChar === "\"") {
        current += "\"";
        index += 1;
        continue;
      }

      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current);
  return values.map((value) => value.trim());
}

function parseAirportRecord(line: string): AirportRecord | null {
  const columns = parseCsvLine(line);
  if (columns.length < 8) {
    return null;
  }

  const [id, name, city, country, iata, icao, latitude, longitude] = columns;
  if (!id || !name || !city || !country || !iata || iata === "\\N" || !icao) {
    return null;
  }

  const latitudeValue = Number.parseFloat(latitude ?? "");
  const longitudeValue = Number.parseFloat(longitude ?? "");
  if (!Number.isFinite(latitudeValue) || !Number.isFinite(longitudeValue)) {
    return null;
  }

  return {
    id,
    name: sanitizeCatalogText(name),
    city: sanitizeCatalogText(city),
    country: sanitizeCatalogText(country),
    iata: iata.toUpperCase(),
    icao: icao.toUpperCase(),
    latitude: latitudeValue,
    longitude: longitudeValue
  };
}

function parseAirlineRecord(line: string): AirlineRecord | null {
  const columns = parseCsvLine(line);
  if (columns.length < 8) {
    return null;
  }

  const [id, name, , iata, icao, , country, active] = columns;
  if (!id || !name || !country || !iata || iata === "\\N") {
    return null;
  }

  return {
    id,
    name: sanitizeCatalogText(name),
    iata: iata.toUpperCase(),
    icao: icao === "\\N" ? "" : icao.toUpperCase(),
    country: sanitizeCatalogText(country),
    active: active === "Y"
  };
}

async function loadCatalogFile(url: string): Promise<string> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to load catalog data from ${url}.`);
    }

    return response.text();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(message);
  }
}

async function loadAirportsCatalog(): Promise<AirportRecord[]> {
  if (!airportsPromise) {
    airportsPromise = loadCatalogFile(airportsCsvUrl)
      .then((contents) =>
        contents
          .split(/\r?\n/u)
          .map(parseAirportRecord)
          .filter((record): record is AirportRecord => record !== null)
      )
      .catch((error) => {
        airportsPromise = null;
        throw error;
      });
  }

  return airportsPromise;
}

async function loadAirlinesCatalog(): Promise<AirlineRecord[]> {
  if (!airlinesPromise) {
    airlinesPromise = loadCatalogFile(airlinesCsvUrl)
      .then((contents) => {
        const seen = new Set<string>();

        return contents
          .split(/\r?\n/u)
          .map(parseAirlineRecord)
          .filter((record): record is AirlineRecord => record !== null)
          .filter((record) => {
            if (!record.active || seen.has(record.iata)) {
              return false;
            }

            seen.add(record.iata);
            return true;
          })
          .sort((left, right) => left.iata.localeCompare(right.iata));
      })
      .catch((error) => {
        airlinesPromise = null;
        throw error;
      });
  }

  return airlinesPromise;
}

function scoreAirportMatch(
  airport: AirportRecord,
  normalizedQuery: string
): number {
  const iata = airport.iata.toLowerCase();
  const icao = airport.icao.toLowerCase();
  const name = airport.name.toLowerCase();
  const city = airport.city.toLowerCase();
  const country = airport.country.toLowerCase();
  const nameWords = name.split(/\s+/u);
  const cityWords = city.split(/\s+/u);

  if (iata === normalizedQuery) {
    return 0;
  }

  if (icao === normalizedQuery) {
    return 1;
  }

  if (city === normalizedQuery) {
    return 2;
  }

  if (name === normalizedQuery) {
    return 3;
  }

  if (iata.startsWith(normalizedQuery)) {
    return 4;
  }

  if (icao.startsWith(normalizedQuery)) {
    return 5;
  }

  if (city.startsWith(normalizedQuery)) {
    return 6;
  }

  if (name.startsWith(normalizedQuery)) {
    return 7;
  }

  if (cityWords.some((word) => word.startsWith(normalizedQuery))) {
    return 8;
  }

  if (nameWords.some((word) => word.startsWith(normalizedQuery))) {
    return 9;
  }

  if (iata.includes(normalizedQuery)) {
    return 10;
  }

  if (icao.includes(normalizedQuery)) {
    return 11;
  }

  if (city.includes(normalizedQuery)) {
    return 12;
  }

  if (name.includes(normalizedQuery)) {
    return 13;
  }

  if (country.includes(normalizedQuery)) {
    return 14;
  }

  return Number.POSITIVE_INFINITY;
}

function scoreAirlineMatch(
  airline: AirlineRecord,
  normalizedQuery: string
): number {
  const iata = airline.iata.toLowerCase();
  const icao = airline.icao.toLowerCase();
  const name = airline.name.toLowerCase();
  const country = airline.country.toLowerCase();
  const nameWords = name.split(/\s+/u);

  if (iata === normalizedQuery) {
    return 0;
  }

  if (icao === normalizedQuery) {
    return 1;
  }

  if (name === normalizedQuery) {
    return 2;
  }

  if (iata.startsWith(normalizedQuery)) {
    return 3;
  }

  if (icao.startsWith(normalizedQuery)) {
    return 4;
  }

  if (name.startsWith(normalizedQuery)) {
    return 5;
  }

  if (nameWords.some((word) => word.startsWith(normalizedQuery))) {
    return 6;
  }

  if (iata.includes(normalizedQuery)) {
    return 7;
  }

  if (icao.includes(normalizedQuery)) {
    return 8;
  }

  if (name.includes(normalizedQuery)) {
    return 9;
  }

  if (country.includes(normalizedQuery)) {
    return 10;
  }

  return Number.POSITIVE_INFINITY;
}

export async function searchCatalogAirports(
  query: string,
  limit = 8
): Promise<AirportRecord[]> {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return [];
  }

  const airports = await loadAirportsCatalog();
  return airports
    .map((airport) => ({
      airport,
      score: scoreAirportMatch(airport, normalized)
    }))
    .filter((entry) => Number.isFinite(entry.score))
    .sort((left, right) => {
      if (left.score !== right.score) {
        return left.score - right.score;
      }

      if (left.airport.name.length !== right.airport.name.length) {
        return left.airport.name.length - right.airport.name.length;
      }

      return left.airport.name.localeCompare(right.airport.name);
    })
    .map((entry) => entry.airport)
    .slice(0, limit);
}

export async function searchCatalogAirlines(
  query: string,
  limit = 12
): Promise<AirlineRecord[]> {
  const normalized = query.trim().toLowerCase();
  const airlines = await loadAirlinesCatalog();

  if (!normalized) {
    return airlines.slice(0, limit);
  }

  return airlines
    .map((airline) => ({
      airline,
      score: scoreAirlineMatch(airline, normalized)
    }))
    .filter((entry) => Number.isFinite(entry.score))
    .sort((left, right) => {
      if (left.score !== right.score) {
        return left.score - right.score;
      }

      if (left.airline.name.length !== right.airline.name.length) {
        return left.airline.name.length - right.airline.name.length;
      }

      return left.airline.name.localeCompare(right.airline.name);
    })
    .map((entry) => entry.airline)
    .slice(0, limit);
}
