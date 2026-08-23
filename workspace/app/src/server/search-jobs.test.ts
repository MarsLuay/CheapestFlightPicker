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
    vi.useRealTimers();
  });

  describe("createSearchJob", () => {
    it("creates a new job with initial status", () => {
      const job = createSearchJob();
      expect(job.id).toBeDefined();
      expect(job.status).toBe("queued");
      expect(job.progress.percent).toBe(0);
      expect(job.progress.stage).toBe("Queued");
    });
  });

  describe("getSearchJobAbortSignal", () => {
    it("returns an AbortSignal for an existing job", () => {
      const job = createSearchJob();
      const signal = getSearchJobAbortSignal(job.id);
      expect(signal).toBeInstanceOf(AbortSignal);
    });

    it("returns null for a non-existent job", () => {
      const signal = getSearchJobAbortSignal("invalid-id");
      expect(signal).toBeNull();
    });
  });

  describe("cancelSearchJob", () => {
    it("cancels a queued or running job", () => {
      const job = createSearchJob();
      const signal = getSearchJobAbortSignal(job.id);

      let aborted = false;
      if (signal) {
        signal.addEventListener("abort", () => {
          aborted = true;
        });
      }

      const canceledJob = cancelSearchJob(job.id);
      expect(canceledJob).not.toBeNull();
      expect(canceledJob?.status).toBe("failed");
      expect(canceledJob?.error).toBe("Search canceled.");
      expect(canceledJob?.progress.stage).toBe("Canceled");
      expect(aborted).toBe(true);

      // The controller should be deleted
      expect(getSearchJobAbortSignal(job.id)).toBeNull();
    });

    it("returns null for a non-existent job", () => {
      expect(cancelSearchJob("invalid-id")).toBeNull();
    });

    it("returns the job unchanged if it is already completed", () => {
      const job = createSearchJob();
      completeSearchJob(job.id, { flights: [] } as unknown as SearchSummary);

      const canceledJob = cancelSearchJob(job.id);
      expect(canceledJob?.status).toBe("completed");
    });

    it("returns the job unchanged if it is already failed", () => {
      const job = createSearchJob();
      failSearchJob(job.id, "Some error");

      const canceledJob = cancelSearchJob(job.id);
      expect(canceledJob?.status).toBe("failed");
      expect(canceledJob?.error).toBe("Some error");
    });
  });

  describe("getSearchJob", () => {
    it("returns the job without resumeCheckpoint", () => {
      const job = createSearchJob();
      updateSearchJobResumeCheckpoint(job.id, { some: "data" } as unknown as SearchResumeCheckpoint);

      const retrieved = getSearchJob(job.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved).not.toHaveProperty("resumeCheckpoint");
      expect(retrieved?.id).toBe(job.id);
    });

    it("returns null for non-existent job", () => {
      expect(getSearchJob("invalid-id")).toBeNull();
    });
  });

  describe("getSearchJobWithCheckpoint", () => {
    it("returns the job including resumeCheckpoint", () => {
      const job = createSearchJob();
      const checkpoint = { some: "data" } as unknown as SearchResumeCheckpoint;
      updateSearchJobResumeCheckpoint(job.id, checkpoint);

      const retrieved = getSearchJobWithCheckpoint(job.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.resumeCheckpoint).toEqual(checkpoint);
    });
  });

  describe("updateSearchJobProgress", () => {
    it("updates progress and changes status to running", () => {
      const job = createSearchJob();
      const newProgress: SearchProgress = {
        stage: "Searching",
        detail: "Finding flights",
        completedSteps: 1,
        totalSteps: 2,
        percent: 50
      };

      const updated = updateSearchJobProgress(job.id, newProgress);
      expect(updated?.status).toBe("running");
      expect(updated?.progress).toEqual(newProgress);
    });

    it("returns unchanged job if already completed or failed", () => {
      const job = createSearchJob();
      failSearchJob(job.id, "Error");

      const newProgress: SearchProgress = {
        stage: "Searching",
        detail: "Finding flights",
        completedSteps: 1,
        totalSteps: 2,
        percent: 50
      };

      const updated = updateSearchJobProgress(job.id, newProgress);
      expect(updated?.status).toBe("failed");
      expect(updated?.progress.stage).not.toBe("Searching");
    });

    it("returns null for non-existent job", () => {
      expect(updateSearchJobProgress("invalid-id", {} as SearchProgress)).toBeNull();
    });
  });

  describe("updateSearchJobResumeCheckpoint", () => {
    it("updates the resume checkpoint", () => {
      const job = createSearchJob();
      const checkpoint = { state: "saved" } as unknown as SearchResumeCheckpoint;

      const updated = updateSearchJobResumeCheckpoint(job.id, checkpoint);
      expect(updated?.resumeCheckpoint).toEqual(checkpoint);
    });

    it("returns null for non-existent job", () => {
      expect(updateSearchJobResumeCheckpoint("invalid-id", {} as SearchResumeCheckpoint)).toBeNull();
    });
  });

  describe("completeSearchJob", () => {
    it("completes the job and removes the abort controller", () => {
      const job = createSearchJob();
      updateSearchJobProgress(job.id, {
        stage: "Searching",
        detail: "Finding flights",
        completedSteps: 1,
        totalSteps: 2,
        percent: 50
      });

      const summary = { flights: [] } as unknown as SearchSummary;
      const completed = completeSearchJob(job.id, summary);

      expect(completed?.status).toBe("completed");
      expect(completed?.summary).toEqual(summary);
      expect(completed?.progress.percent).toBe(100);
      expect(completed?.progress.stage).toBe("Completed");
      expect(completed?.progress.completedSteps).toBe(2);
      expect(getSearchJobAbortSignal(job.id)).toBeNull();
    });

    it("returns null for non-existent job", () => {
      expect(completeSearchJob("invalid-id", {} as SearchSummary)).toBeNull();
    });
  });

  describe("failSearchJob", () => {
    it("fails the job and removes the abort controller", () => {
      const job = createSearchJob();

      const failed = failSearchJob(job.id, "Something went wrong");
      expect(failed?.status).toBe("failed");
      expect(failed?.error).toBe("Something went wrong");
      expect(failed?.progress.stage).toBe("Failed");
      expect(getSearchJobAbortSignal(job.id)).toBeNull();
    });

    it("returns unchanged job if already completed or failed", () => {
      const job = createSearchJob();
      completeSearchJob(job.id, {} as SearchSummary);

      const failed = failSearchJob(job.id, "New error");
      expect(failed?.status).toBe("completed");
      expect(failed?.error).toBeUndefined();
    });

    it("returns null for non-existent job", () => {
      expect(failSearchJob("invalid-id", "Error")).toBeNull();
    });
  });

  describe("pruneJobs", () => {
    it("removes jobs older than the retention period", () => {
      // Set to a specific time
      const initialTime = new Date("2024-01-01T12:00:00Z").getTime();
      vi.setSystemTime(initialTime);

      const job1 = createSearchJob();

      // Advance time by 15 minutes (retention is 30m)
      vi.advanceTimersByTime(15 * 60 * 1000);
      const job2 = createSearchJob();

      // Advance time by another 20 minutes (total 35m)
      // job1 is now 35m old, job2 is 20m old
      vi.advanceTimersByTime(20 * 60 * 1000);

      // Trigger prune by creating another job or fetching a job
      const job3 = createSearchJob();

      expect(getSearchJob(job1.id)).toBeNull();
      expect(getSearchJob(job2.id)).not.toBeNull();
      expect(getSearchJob(job3.id)).not.toBeNull();
    });
  });
});
