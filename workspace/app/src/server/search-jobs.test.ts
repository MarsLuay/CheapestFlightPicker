import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  cancelSearchJob,
  completeSearchJob,
  createSearchJob,
  failSearchJob,
  getSearchJob,
  getSearchJobAbortSignal,
  getSearchJobWithCheckpoint,
  updateSearchJobProgress,
  updateSearchJobResumeCheckpoint
} from "./search-jobs";
import type { SearchProgress, SearchResumeCheckpoint, SearchSummary } from "../shared/types";

describe("search-jobs", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("createSearchJob", () => {
    it("creates a new search job with default values", () => {
      const job = createSearchJob();
      expect(job.id).toBeDefined();
      expect(job.status).toBe("queued");
      expect(job.progress.stage).toBe("Queued");
      expect(job.progress.percent).toBe(0);

      const fetchedJob = getSearchJob(job.id);
      expect(fetchedJob).toEqual(job);
    });

    it("initializes an abort signal", () => {
      const job = createSearchJob();
      const signal = getSearchJobAbortSignal(job.id);
      expect(signal).toBeInstanceOf(AbortSignal);
      expect(signal?.aborted).toBe(false);
    });
  });

  describe("getSearchJob", () => {
    it("returns null for non-existent job", () => {
      expect(getSearchJob("invalid-id")).toBeNull();
    });

    it("strips out resumeCheckpoint for getSearchJob", () => {
      const job = createSearchJob();
      const checkpoint: SearchResumeCheckpoint = {
        version: 1,
        request: {} as any,
        departureDatePrices: [],
        returnDatePrices: []
      };

      updateSearchJobResumeCheckpoint(job.id, checkpoint);

      const fetchedJob = getSearchJob(job.id);
      expect(fetchedJob?.resumeCheckpoint).toBeUndefined();
    });
  });

  describe("getSearchJobWithCheckpoint", () => {
    it("returns null for non-existent job", () => {
      expect(getSearchJobWithCheckpoint("invalid-id")).toBeNull();
    });

    it("includes resumeCheckpoint", () => {
      const job = createSearchJob();
      const checkpoint: SearchResumeCheckpoint = {
        version: 1,
        request: {} as any,
        departureDatePrices: [],
        returnDatePrices: []
      };

      updateSearchJobResumeCheckpoint(job.id, checkpoint);

      const fetchedJob = getSearchJobWithCheckpoint(job.id);
      expect(fetchedJob?.resumeCheckpoint).toEqual(checkpoint);
    });
  });

  describe("cancelSearchJob", () => {
    it("returns null for non-existent job", () => {
      expect(cancelSearchJob("invalid-id")).toBeNull();
    });

    it("cancels a queued or running job", () => {
      const job = createSearchJob();
      const signal = getSearchJobAbortSignal(job.id);

      const canceled = cancelSearchJob(job.id);
      expect(canceled?.status).toBe("failed");
      expect(canceled?.error).toBe("Search canceled.");
      expect(canceled?.progress.stage).toBe("Canceled");
      expect(signal?.aborted).toBe(true);

      // Abort controller should be deleted
      expect(getSearchJobAbortSignal(job.id)).toBeNull();
    });

    it("does not modify completed job status but returns it without checkpoint", () => {
      const job = createSearchJob();
      const summary: SearchSummary = {} as any;
      completeSearchJob(job.id, summary);

      const canceled = cancelSearchJob(job.id);
      expect(canceled?.status).toBe("completed");
    });
  });

  describe("updateSearchJobProgress", () => {
    it("returns null for non-existent job", () => {
      expect(updateSearchJobProgress("invalid-id", {} as any)).toBeNull();
    });

    it("updates progress and sets status to running", () => {
      const job = createSearchJob();
      const progress: SearchProgress = {
        stage: "Searching",
        completedSteps: 1,
        totalSteps: 2,
        percent: 50
      };

      const updated = updateSearchJobProgress(job.id, progress);
      expect(updated?.status).toBe("running");
      expect(updated?.progress).toEqual(progress);
    });

    it("ignores updates for completed jobs", () => {
      const job = createSearchJob();
      completeSearchJob(job.id, {} as any);

      const progress: SearchProgress = {
        stage: "Late update",
        completedSteps: 1,
        totalSteps: 2,
        percent: 50
      };
      const updated = updateSearchJobProgress(job.id, progress);
      expect(updated?.status).toBe("completed");
      expect(updated?.progress.stage).toBe("Completed"); // From completeSearchJob
    });
  });

  describe("completeSearchJob", () => {
    it("returns null for non-existent job", () => {
      expect(completeSearchJob("invalid-id", {} as any)).toBeNull();
    });

    it("completes a job and cleans up abort controller", () => {
      const job = createSearchJob();
      const summary: SearchSummary = {
        request: {} as any,
        departureDatePrices: [],
        returnDatePrices: [],
        cheapestOverall: null,
        cheapestRoundTrip: null,
        cheapestTwoOneWays: null,
        cheapestNonstop: null,
        cheapestMultiStop: null,
        evaluatedDatePairs: [],
        inspectedOptions: 0,
        timingGuidance: null,
        priceAlert: null,
        hackerFareInsight: null
      };

      const completed = completeSearchJob(job.id, summary);
      expect(completed?.status).toBe("completed");
      expect(completed?.summary).toEqual(summary);
      expect(completed?.progress.percent).toBe(100);
      expect(completed?.progress.stage).toBe("Completed");

      expect(getSearchJobAbortSignal(job.id)).toBeNull();
    });
  });

  describe("failSearchJob", () => {
    it("returns null for non-existent job", () => {
      expect(failSearchJob("invalid-id", "error")).toBeNull();
    });

    it("fails a job and cleans up abort controller", () => {
      const job = createSearchJob();

      const failed = failSearchJob(job.id, "Something went wrong");
      expect(failed?.status).toBe("failed");
      expect(failed?.error).toBe("Something went wrong");
      expect(failed?.progress.stage).toBe("Failed");
      expect(failed?.progress.detail).toBe("Something went wrong");

      expect(getSearchJobAbortSignal(job.id)).toBeNull();
    });

    it("ignores failure for already completed jobs", () => {
      const job = createSearchJob();
      completeSearchJob(job.id, {} as any);

      const failed = failSearchJob(job.id, "Error after complete");
      expect(failed?.status).toBe("completed");
      expect(failed?.error).toBeUndefined();
    });
  });

  describe("pruneJobs", () => {
    it("prunes jobs older than retention time", () => {
      const job = createSearchJob();
      expect(getSearchJob(job.id)).toBeDefined();

      // Advance time by 30 minutes + 1 ms
      vi.advanceTimersByTime(1000 * 60 * 30 + 1);

      // Creating a new job triggers pruning
      createSearchJob();

      expect(getSearchJob(job.id)).toBeNull();
    });

    it("keeps jobs within retention time", () => {
      const job = createSearchJob();
      expect(getSearchJob(job.id)).toBeDefined();

      // Advance time by 29 minutes
      vi.advanceTimersByTime(1000 * 60 * 29);

      // Creating a new job triggers pruning
      createSearchJob();

      expect(getSearchJob(job.id)).toBeDefined();
    });
  });
});
