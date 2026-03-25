import fs from "node:fs";

import type { AirlineRecord, AirportRecord } from "../shared/types";
import { resolveAppPath } from "./project-paths";

const airportsPath = resolveAppPath("data", "airports.csv");
const airlinesPath = resolveAppPath("data", "airlines.csv");

let airportCache: AirportRecord[] | null = null;
let airlineCache: AirlineRecord[] | null = null;

function sanitizeCatalogText(value: string): string {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu, "").trim();
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
    iata,
    icao,
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
  if (!id || !name || !country) {
    return null;
  }

  if (!iata || iata === "\\N") {
    return null;
  }

  return {
    id,
    name: sanitizeCatalogText(name),
    iata: iata.toUpperCase(),
    icao: icao === "\\N" ? "" : icao,
    country: sanitizeCatalogText(country),
    active: active === "Y"
  };
}

export function loadAirports(): AirportRecord[] {
  if (airportCache) {
    return airportCache;
  }

  const contents = fs.readFileSync(airportsPath, "utf8");
  airportCache = contents
    .split(/\r?\n/u)
    .map(parseAirportRecord)
    .filter((record): record is AirportRecord => record !== null);

  return airportCache;
}

export function loadAirlines(): AirlineRecord[] {
  if (airlineCache) {
    return airlineCache;
  }

  const contents = fs.readFileSync(airlinesPath, "utf8");
  const seen = new Set<string>();

  airlineCache = contents
    .split(/\r?\n/u)
    .map(parseAirlineRecord)
    .filter((record): record is AirlineRecord => record !== null)
    .filter((record) => {
      if (!record.active) {
        return false;
      }

      if (seen.has(record.iata)) {
        return false;
      }

      seen.add(record.iata);
      return true;
    })
    .sort((left, right) => left.iata.localeCompare(right.iata));

  return airlineCache;
}

export function findAirportByCode(code: string): AirportRecord | undefined {
  const normalized = code.toUpperCase();
  return loadAirports().find((airport) => airport.iata === normalized);
}

export function findAirlineByCode(code: string): AirlineRecord | undefined {
  const normalized = code.toUpperCase();
  return loadAirlines().find((airline) => airline.iata === normalized);
}

export function searchAirports(query: string, limit = 8): AirportRecord[] {
  const normalized = query.trim().toLowerCase();

  if (!normalized) {
    return [];
  }

  return loadAirports()
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

export function searchAirlines(query: string, limit = 12): AirlineRecord[] {
  const normalized = query.trim().toLowerCase();

  if (!normalized) {
    return loadAirlines().slice(0, limit);
  }

  return loadAirlines()
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
