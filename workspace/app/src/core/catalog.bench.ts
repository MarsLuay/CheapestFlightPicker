import { describe, bench } from 'vitest';
import { findClosestAirport } from './catalog';

describe('findClosestAirport', () => {
  bench('finds closest airport to Tokyo', () => {
    findClosestAirport(35.6762, 139.6503);
  });
  bench('finds closest airport to New York', () => {
    findClosestAirport(40.7128, -74.0060);
  });
  bench('finds closest airport to London', () => {
    findClosestAirport(51.5074, -0.1278);
  });
});
