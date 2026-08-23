import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  SearchProgress,
  SearchResumeCheckpoint,
  SearchSummary
} from "../shared/types";
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

describe("search-jobs", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("createSearchJob", () => {
    it("should create a new job and return it with initial status", () => {
      const job = createSearchJob();
      expect(job.id).toBeDefined();
      expect(job.status).toBe("queued");
      expect(job.createdAt).toBeDefined();
      expect(job.updatedAt).toBeDefined();
      expect(job.progress.stage).toBe("Queued");
    });
  });

  describe("getSearchJob", () => {
    it("should return the job without resumeCheckpoint", () => {
      const createdJob = createSearchJob();
      const mockCheckpoint = { version: 1 } as SearchResumeCheckpoint;
      updateSearchJobResumeCheckpoint(createdJob.id, mockCheckpoint);

      const job = getSearchJob(createdJob.id);
      expect(job).toBeDefined();
      if (job) {
        expect(job.id).toBe(createdJob.id);
        expect(job.resumeCheckpoint).toBeUndefined();
      }
    });

    it("should return null for non-existent job", () => {
      expect(getSearchJob("non-existent-id")).toBeNull();
    });
  });

  describe("getSearchJobWithCheckpoint", () => {
    it("should return the job with resumeCheckpoint", () => {
      const createdJob = createSearchJob();
      const mockCheckpoint = { version: 1 } as SearchResumeCheckpoint;
      updateSearchJobResumeCheckpoint(createdJob.id, mockCheckpoint);

      const job = getSearchJobWithCheckpoint(createdJob.id);
      expect(job).toBeDefined();
      if (job) {
        expect(job.id).toBe(createdJob.id);
        expect(job.resumeCheckpoint).toEqual(mockCheckpoint);
      }
    });

    it("should return null for non-existent job", () => {
      expect(getSearchJobWithCheckpoint("non-existent-id")).toBeNull();
    });
  });

  describe("getSearchJobAbortSignal", () => {
    it("should return an abort signal for a valid job", () => {
      const job = createSearchJob();
      const signal = getSearchJobAbortSignal(job.id);
      expect(signal).toBeInstanceOf(AbortSignal);
      expect(signal?.aborted).toBe(false);
    });

    it("should return null for a non-existent job", () => {
      expect(getSearchJobAbortSignal("non-existent-id")).toBeNull();
    });
  });

  describe("cancelSearchJob", () => {
    it("should cancel an active job, trigger abort signal, and return it as failed", () => {
      const job = createSearchJob();
      const signal = getSearchJobAbortSignal(job.id);

      const canceledJob = cancelSearchJob(job.id);
      expect(canceledJob).toBeDefined();
      expect(canceledJob?.status).toBe("failed");
      expect(canceledJob?.error).toBe("Search canceled.");
      expect(canceledJob?.progress.stage).toBe("Canceled");
      expect(canceledJob?.resumeCheckpoint).toBeUndefined();

      expect(signal?.aborted).toBe(true);
      // Abort controller should be removed
      expect(getSearchJobAbortSignal(job.id)).toBeNull();
    });

    it("should return null if the job does not exist", () => {
      expect(cancelSearchJob("non-existent-id")).toBeNull();
    });

    it("should not modify a completed job", () => {
      const job = createSearchJob();
      completeSearchJob(job.id, {} as SearchSummary);

      const result = cancelSearchJob(job.id);
      expect(result?.status).toBe("completed");
    });

    it("should not modify an already failed job", () => {
      const job = createSearchJob();
      failSearchJob(job.id, "Some error");

      const result = cancelSearchJob(job.id);
      expect(result?.status).toBe("failed");
      expect(result?.error).toBe("Some error"); // Not overwritten
    });
  });

  describe("updateSearchJobProgress", () => {
    it("should update progress and set status to running", () => {
      const job = createSearchJob();
      const newProgress: SearchProgress = {
        stage: "Searching",
        completedSteps: 1,
        totalSteps: 2,
        percent: 50
      };

      vi.advanceTimersByTime(1000); // Advance timer to test updatedAt change

      const updatedJob = updateSearchJobProgress(job.id, newProgress);
      expect(updatedJob?.status).toBe("running");
      expect(updatedJob?.progress).toEqual(newProgress);
      expect(updatedJob?.updatedAt).not.toBe(job.updatedAt);
    });

    it("should return null if job does not exist", () => {
      expect(updateSearchJobProgress("non-existent", {} as SearchProgress)).toBeNull();
    });

    it("should not update progress if job is completed or failed", () => {
      const job = createSearchJob();
      failSearchJob(job.id, "Error");

      const newProgress: SearchProgress = {
        stage: "Searching",
        completedSteps: 1,
        totalSteps: 2,
        percent: 50
      };
      const result = updateSearchJobProgress(job.id, newProgress);

      expect(result?.status).toBe("failed");
      expect(result?.progress.stage).toBe("Failed"); // from failSearchJob
    });
  });

  describe("updateSearchJobResumeCheckpoint", () => {
    it("should update resume checkpoint for a job", () => {
      const job = createSearchJob();
      const checkpoint: SearchResumeCheckpoint = { version: 1 } as SearchResumeCheckpoint;

      const updatedJob = updateSearchJobResumeCheckpoint(job.id, checkpoint);
      expect(updatedJob?.resumeCheckpoint).toEqual(checkpoint);
    });

    it("should return null for non-existent job", () => {
      expect(updateSearchJobResumeCheckpoint("non", {} as SearchResumeCheckpoint)).toBeNull();
    });
  });

  describe("completeSearchJob", () => {
    it("should complete job with summary and update progress", () => {
      const job = createSearchJob();
      const summary: SearchSummary = {} as SearchSummary;

      const result = completeSearchJob(job.id, summary);
      expect(result?.status).toBe("completed");
      expect(result?.summary).toEqual(summary);
      expect(result?.progress.stage).toBe("Completed");
      expect(result?.progress.percent).toBe(100);

      // Should remove abort controller
      expect(getSearchJobAbortSignal(job.id)).toBeNull();
    });

    it("should return null for non-existent job", () => {
      expect(completeSearchJob("non", {} as SearchSummary)).toBeNull();
    });
  });

  describe("failSearchJob", () => {
    it("should fail the job with provided error and update progress", () => {
      const job = createSearchJob();
      const result = failSearchJob(job.id, "Something went wrong");

      expect(result?.status).toBe("failed");
      expect(result?.error).toBe("Something went wrong");
      expect(result?.progress.stage).toBe("Failed");
      expect(result?.progress.detail).toBe("Something went wrong");

      // Should remove abort controller
      expect(getSearchJobAbortSignal(job.id)).toBeNull();
    });

    it("should return null for non-existent job", () => {
      expect(failSearchJob("non", "error")).toBeNull();
    });

    it("should not modify already completed job", () => {
      const job = createSearchJob();
      completeSearchJob(job.id, {} as SearchSummary);

      const result = failSearchJob(job.id, "Error later");
      expect(result?.status).toBe("completed");
    });
  });

  describe("job pruning", () => {
    it("should prune old jobs upon new operations", () => {
      const job = createSearchJob();
      expect(getSearchJob(job.id)).not.toBeNull();

      // Advance time beyond jobRetentionMs (1000 * 60 * 30) -> 30 minutes
      vi.advanceTimersByTime(31 * 60 * 1000);

      // Operations like createSearchJob, getSearchJob, getSearchJobWithCheckpoint trigger pruneJobs()
      const newJob = createSearchJob();

      // The old job should be deleted
      expect(getSearchJob(job.id)).toBeNull();
    });
  });
});
