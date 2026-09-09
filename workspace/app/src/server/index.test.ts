import { describe, expect, it, vi, beforeEach } from "vitest";
import request from "supertest";

vi.mock("../core/search", () => {
  const mockSearch = vi.fn();
  return {
    mockSearch,
    FlightSearchService: class {
      search = mockSearch;
    }
  };
});

import app from "./index";
import { GoogleFlightsRateLimitError, GoogleFlightsUnavailableError } from "../providers/google-flights/client";

// Get the mocked module to access mockSearch
import * as searchCore from "../core/search";
const { mockSearch } = searchCore as any;

describe("POST /api/search fallback behavior", () => {
  beforeEach(() => {
    mockSearch.mockReset();
  });

  it("returns 429 status and friendly error message when provider rate limits", async () => {
    mockSearch.mockRejectedValue(new GoogleFlightsRateLimitError());

    const response = await request(app)
      .post("/api/search")
      .send({
        passengers: 1,
        legs: [
          { origin: "SFO", destination: "LAX", date: "2024-01-01" }
        ]
      });

    expect(response.status).toBe(429);
    expect(response.body).toEqual({
      ok: false,
      error: "Google Flights temporarily rate limited this search. Wait a minute and try again. If this keeps happening, try turning on a VPN."
    });
  });

  it("returns 503 status and friendly error message when provider is unavailable", async () => {
    mockSearch.mockRejectedValue(new GoogleFlightsUnavailableError());

    const response = await request(app)
      .post("/api/search")
      .send({
        passengers: 1,
        legs: [
          { origin: "SFO", destination: "LAX", date: "2024-01-01" }
        ]
      });

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      ok: false,
      error: "Google Flights rejected this search (temporary provider error). Wait a minute and try again. If this keeps happening, try a VPN or run the search later."
    });
  });
});
