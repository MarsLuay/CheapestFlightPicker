import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";
import app from "./index";
import { FlightSearchService } from "../core/search";

describe("POST /api/search/jobs", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("error path", () => {
    it("fails the job if searchService.search throws an error", async () => {
      const error = new Error("Test search failure");
      vi.spyOn(FlightSearchService.prototype, "search").mockRejectedValueOnce(error);

      const payload = {
        requestInput: {
          tripType: "round_trip",
          origin: "SEA",
          destination: "SFO",
          departureDateFrom: "2026-05-01",
          departureDateTo: "2026-05-01",
          returnDateFrom: "2026-05-05",
          returnDateTo: "2026-05-05",
          cabinClass: "economy",
          passengers: 1
        }
      };

      const postResponse = await request(app)
        .post("/api/search/jobs")
        .send(payload)
        .expect(202);

      const jobId = postResponse.body.jobId;
      expect(jobId).toBeTypeOf("string");

      // Wait for the async task to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      const getResponse = await request(app)
        .get(`/api/search/jobs/${jobId}`)
        .expect(200);

      expect(getResponse.body.status).toBe("failed");
      expect(getResponse.body.error).toContain("Test search failure");
    });

    it("fails the job with 'Search canceled.' if aborted", async () => {
      const error = new Error("aborted");
      error.name = "AbortError";
      vi.spyOn(FlightSearchService.prototype, "search").mockRejectedValueOnce(error);

      const payload = {
        requestInput: {
          tripType: "round_trip",
          origin: "SEA",
          destination: "SFO",
          departureDateFrom: "2026-05-01",
          departureDateTo: "2026-05-01",
          returnDateFrom: "2026-05-05",
          returnDateTo: "2026-05-05",
          cabinClass: "economy",
          passengers: 1
        }
      };

      const postResponse = await request(app)
        .post("/api/search/jobs")
        .send(payload)
        .expect(202);

      const jobId = postResponse.body.jobId;
      expect(jobId).toBeTypeOf("string");

      // Wait for the async task to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      const getResponse = await request(app)
        .get(`/api/search/jobs/${jobId}`)
        .expect(200);

      expect(getResponse.body.status).toBe("failed");
      expect(getResponse.body.error).toBe("Search canceled.");
    });
  });
});
