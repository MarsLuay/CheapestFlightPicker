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
    vi.restoreAllMocks();
  });

  describe("createSearchJob", () => {
    it("creates a new job with a queued status", () => {
      const job = createSearchJob();
      expect(job.id).toBeDefined();
      expect(job.status).toBe("queued");
      expect(job.progress.stage).toBe("Queued");
      expect(job.progress.percent).toBe(0);

      const fetchedJob = getSearchJob(job.id);
      expect(fetchedJob).toEqual(job);
    });

    it("prunes old jobs when creating a new job", () => {
      const job1 = createSearchJob();

      // Advance time by 31 minutes
      vi.advanceTimersByTime(31 * 60 * 1000);

      const job2 = createSearchJob();

      expect(getSearchJob(job1.id)).toBeNull();
      expect(getSearchJob(job2.id)).toBeDefined();
    });
  });

  describe("getSearchJobAbortSignal", () => {
    it("returns an AbortSignal for an active job", () => {
      const job = createSearchJob();
      const signal = getSearchJobAbortSignal(job.id);
      expect(signal).toBeInstanceOf(AbortSignal);
      expect(signal?.aborted).toBe(false);
    });

    it("returns null for a non-existent job", () => {
      expect(getSearchJobAbortSignal("invalid-id")).toBeNull();
    });
  });

  describe("cancelSearchJob", () => {
    it("cancels an active job, updating its status and aborting the signal", () => {
      const job = createSearchJob();
      const signal = getSearchJobAbortSignal(job.id);

      const cancelledJob = cancelSearchJob(job.id);

      expect(cancelledJob?.status).toBe("failed");
      expect(cancelledJob?.error).toBe("Search canceled.");
      expect(cancelledJob?.progress.stage).toBe("Canceled");
      expect(signal?.aborted).toBe(true);
    });

    it("returns null for non-existent job", () => {
      expect(cancelSearchJob("invalid-id")).toBeNull();
    });

    it("does not modify a completed job", () => {
      const job = createSearchJob();
      const summary: SearchSummary = { cheapestPrice: 100, flights: [] };
      completeSearchJob(job.id, summary);

      const cancelledJob = cancelSearchJob(job.id);
      expect(cancelledJob?.status).toBe("completed");
    });

    it("strips resumeCheckpoint from the returned cancelled job", () => {
      const job = createSearchJob();
      const checkpoint: SearchResumeCheckpoint = { providerCheckpoints: {} };
      updateSearchJobResumeCheckpoint(job.id, checkpoint);

      const cancelledJob = cancelSearchJob(job.id);
      expect(cancelledJob).not.toHaveProperty("resumeCheckpoint");
    });
  });

  describe("getSearchJob", () => {
    it("returns null for non-existent job", () => {
      expect(getSearchJob("invalid-id")).toBeNull();
    });

    it("returns the job without resumeCheckpoint", () => {
      const job = createSearchJob();
      const checkpoint: SearchResumeCheckpoint = { providerCheckpoints: {} };
      updateSearchJobResumeCheckpoint(job.id, checkpoint);

      const fetchedJob = getSearchJob(job.id);
      expect(fetchedJob).not.toHaveProperty("resumeCheckpoint");
    });

    it("prunes old jobs when called", () => {
      const job1 = createSearchJob();

      // Advance time by 31 minutes
      vi.advanceTimersByTime(31 * 60 * 1000);

      expect(getSearchJob(job1.id)).toBeNull();
    });
  });

  describe("getSearchJobWithCheckpoint", () => {
    it("returns null for non-existent job", () => {
      expect(getSearchJobWithCheckpoint("invalid-id")).toBeNull();
    });

    it("returns the job with resumeCheckpoint", () => {
      const job = createSearchJob();
      const checkpoint: SearchResumeCheckpoint = { providerCheckpoints: { test: { testData: "123" } } };
      updateSearchJobResumeCheckpoint(job.id, checkpoint);

      const fetchedJob = getSearchJobWithCheckpoint(job.id);
      expect(fetchedJob).toHaveProperty("resumeCheckpoint");
      expect(fetchedJob?.resumeCheckpoint).toEqual(checkpoint);
    });
  });

  describe("updateSearchJobProgress", () => {
    it("updates progress and changes status to running", () => {
      const job = createSearchJob();

      const progress: SearchProgress = {
        stage: "Searching",
        detail: "Looking for flights",
        completedSteps: 1,
        totalSteps: 2,
        percent: 50
      };

      const updatedJob = updateSearchJobProgress(job.id, progress);
      expect(updatedJob?.status).toBe("running");
      expect(updatedJob?.progress).toEqual(progress);
    });

    it("returns null for non-existent job", () => {
      expect(updateSearchJobProgress("invalid-id", {
        stage: "Searching",
        detail: "",
        completedSteps: 0,
        totalSteps: 1,
        percent: 0
      })).toBeNull();
    });

    it("does not update a completed job", () => {
      const job = createSearchJob();
      const summary: SearchSummary = { cheapestPrice: 100, flights: [] };
      completeSearchJob(job.id, summary);

      const progress: SearchProgress = {
        stage: "Searching",
        detail: "Looking for flights",
        completedSteps: 1,
        totalSteps: 2,
        percent: 50
      };

      const updatedJob = updateSearchJobProgress(job.id, progress);
      expect(updatedJob?.status).toBe("completed");
      expect(updatedJob?.progress.stage).toBe("Completed");
    });
  });

  describe("updateSearchJobResumeCheckpoint", () => {
    it("updates the resume checkpoint", () => {
      const job = createSearchJob();
      const checkpoint: SearchResumeCheckpoint = { providerCheckpoints: { test: { testData: "123" } } };

      const updatedJob = updateSearchJobResumeCheckpoint(job.id, checkpoint);
      expect(updatedJob?.resumeCheckpoint).toEqual(checkpoint);

      const fetchedJob = getSearchJobWithCheckpoint(job.id);
      expect(fetchedJob?.resumeCheckpoint).toEqual(checkpoint);
    });

    it("returns null for non-existent job", () => {
      expect(updateSearchJobResumeCheckpoint("invalid-id", { providerCheckpoints: {} })).toBeNull();
    });
  });

  describe("completeSearchJob", () => {
    it("updates status to completed, sets summary, and cleans up abort signal", () => {
      const job = createSearchJob();
      const summary: SearchSummary = { cheapestPrice: 100, flights: [] };

      const completedJob = completeSearchJob(job.id, summary);

      expect(completedJob?.status).toBe("completed");
      expect(completedJob?.summary).toEqual(summary);
      expect(completedJob?.progress.stage).toBe("Completed");
      expect(completedJob?.progress.percent).toBe(100);

      expect(getSearchJobAbortSignal(job.id)).toBeNull();
    });

    it("returns null for non-existent job", () => {
      expect(completeSearchJob("invalid-id", { cheapestPrice: 100, flights: [] })).toBeNull();
    });
  });

  describe("failSearchJob", () => {
    it("updates status to failed, sets error, and cleans up abort signal", () => {
      const job = createSearchJob();
      const errorMessage = "Something went wrong";

      const failedJob = failSearchJob(job.id, errorMessage);

      expect(failedJob?.status).toBe("failed");
      expect(failedJob?.error).toBe(errorMessage);
      expect(failedJob?.progress.stage).toBe("Failed");
      expect(failedJob?.progress.detail).toBe(errorMessage);

      expect(getSearchJobAbortSignal(job.id)).toBeNull();
    });

    it("returns null for non-existent job", () => {
      expect(failSearchJob("invalid-id", "Error")).toBeNull();
    });

    it("returns the existing job state if already completed", () => {
      const job = createSearchJob();
      const summary: SearchSummary = { cheapestPrice: 100, flights: [] };
      completeSearchJob(job.id, summary);

      const failedJob = failSearchJob(job.id, "Error");
      expect(failedJob?.status).toBe("completed");
      expect(failedJob?.error).toBeUndefined();
    });
  });
});
