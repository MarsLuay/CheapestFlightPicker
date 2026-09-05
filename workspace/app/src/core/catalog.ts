import fs from "node:fs";

import type {
  AirlineRecord,
  AirportRecord,
  FlightLeg
} from "../shared/types";
import { resolveAppPath } from "./project-paths";

const airportsPath = resolveAppPath("data", "airports.csv");
const airlinesPath = resolveAppPath("data", "airlines.csv");

let airportCache: AirportRecord[] | null = null;
let airlineCache: AirlineRecord[] | null = null;
let airportMapCache: Map<string, AirportRecord> | null = null;
let airlineMapCache: Map<string, AirlineRecord> | null = null;

interface SpatialNode {
  airport: AirportRecord;
  x: number;
  y: number;
  z: number;
  left: SpatialNode | null;
  right: SpatialNode | null;
}

let airportSpatialIndex: SpatialNode | null = null;

function buildKDTree(nodes: SpatialNode[], depth = 0): SpatialNode | null {
  if (nodes.length === 0) {
    return null;
  }

  const axis = depth % 3;
  nodes.sort((a, b) => {
    if (axis === 0) {
      return a.x - b.x;
    }
    if (axis === 1) {
      return a.y - b.y;
    }
    return a.z - b.z;
  });

  const median = Math.floor(nodes.length / 2);
  const node = nodes[median];

  node.left = buildKDTree(nodes.slice(0, median), depth + 1);
  node.right = buildKDTree(nodes.slice(median + 1), depth + 1);

  return node;
}

function searchKDTree(
  root: SpatialNode | null,
  x: number,
  y: number,
  z: number
): SpatialNode | null {
  let best: SpatialNode | null = null;
  let bestDistSq = Number.POSITIVE_INFINITY;

  function search(node: SpatialNode | null, depth: number): void {
    if (!node) {
      return;
    }

    const dx = node.x - x;
    const dy = node.y - y;
    const dz = node.z - z;
    const distSq = dx * dx + dy * dy + dz * dz;

    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      best = node;
    }

    const axis = depth % 3;
    let diff = 0;
    if (axis === 0) {
      diff = x - node.x;
    } else if (axis === 1) {
      diff = y - node.y;
    } else {
      diff = z - node.z;
    }

    const first = diff < 0 ? node.left : node.right;
    const second = diff < 0 ? node.right : node.left;

    search(first, depth + 1);

    if (diff * diff < bestDistSq) {
      search(second, depth + 1);
    }
  }

  search(root, 0);
  return best;
}

function sanitizeCatalogText(value: string): string {
  // eslint-disable-next-line no-control-regex -- intentionally strip control characters from CSV catalog data
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

function loadAirports(): AirportRecord[] {
  if (airportCache) {
    return airportCache;
  }

  const contents = fs.readFileSync(airportsPath, "utf8");
  airportCache = contents
    .split(/\r?\n/u)
    .map(parseAirportRecord)
    .filter((record): record is AirportRecord => record !== null);

  airportMapCache = new Map();
  const spatialNodes: SpatialNode[] = [];

  for (const airport of airportCache) {
    const key = airport.iata.toUpperCase();
    if (!airportMapCache.has(key)) {
      airportMapCache.set(key, airport);
    }

    const lat = toRadians(airport.latitude);
    const lon = toRadians(airport.longitude);
    spatialNodes.push({
      airport,
      x: Math.cos(lat) * Math.cos(lon),
      y: Math.cos(lat) * Math.sin(lon),
      z: Math.sin(lat),
      left: null,
      right: null
    });
  }

  airportSpatialIndex = buildKDTree(spatialNodes);

  return airportCache;
}

function loadAirlines(): AirlineRecord[] {
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

  airlineMapCache = new Map();
  for (const airline of airlineCache) {
    airlineMapCache.set(airline.iata, airline);
  }

  return airlineCache;
}

export function findAirportByCode(code: string): AirportRecord | undefined {
  loadAirports();
  return airportMapCache?.get(code.toUpperCase());
}

/**
 * Estimate miles flown by summing great-circle distances for each flight leg.
 * A leg's stored distance is reused when available so cached/provider results
 * and ranking use the same value.
 */
export function calculateFlightDistanceMiles(
  legs: Array<
    Pick<FlightLeg, "departureAirportCode" | "arrivalAirportCode"> & {
      distanceMiles?: number;
    }
  >
): number {
  return legs.reduce((total, leg) => {
    if (Number.isFinite(leg.distanceMiles)) {
      return total + (leg.distanceMiles ?? 0);
    }

    const departureAirport = findAirportByCode(leg.departureAirportCode);
    const arrivalAirport = findAirportByCode(leg.arrivalAirportCode);
    if (!departureAirport || !arrivalAirport) {
      return total;
    }

    return (
      total +
      Math.round(
        calculateGreatCircleDistance(
          departureAirport.latitude,
          departureAirport.longitude,
          arrivalAirport.latitude,
          arrivalAirport.longitude
        ) * 0.621371
      )
    );
  }, 0);
}

export function findClosestAirport(
  latitude: number,
  longitude: number
): AirportRecord | undefined {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return undefined;
  }

  loadAirports();
  if (!airportSpatialIndex) {
    return undefined;
  }

  const lat = toRadians(latitude);
  const lon = toRadians(longitude);
  const x = Math.cos(lat) * Math.cos(lon);
  const y = Math.cos(lat) * Math.sin(lon);
  const z = Math.sin(lat);

  const closestNode = searchKDTree(airportSpatialIndex, x, y, z);
  return closestNode?.airport;
}

export function findAirlineByCode(code: string): AirlineRecord | undefined {
  loadAirlines();
  return airlineMapCache?.get(code.toUpperCase());
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

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function calculateGreatCircleDistance(
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number
): number {
  const earthRadiusKm = 6371;
  const latitudeDelta = toRadians(latitudeB - latitudeA);
  const longitudeDelta = toRadians(longitudeB - longitudeA);
  const normalizedLatitudeA = toRadians(latitudeA);
  const normalizedLatitudeB = toRadians(latitudeB);

  const haversineValue =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(normalizedLatitudeA) *
      Math.cos(normalizedLatitudeB) *
      Math.sin(longitudeDelta / 2) ** 2;

  const arc =
    2 * Math.atan2(Math.sqrt(haversineValue), Math.sqrt(1 - haversineValue));

  return earthRadiusKm * arc;
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
