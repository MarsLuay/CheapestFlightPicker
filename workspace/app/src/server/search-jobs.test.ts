import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SearchProgress, SearchResumeCheckpoint, SearchSummary } from "../shared/types";
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
    it("creates a new queued job", () => {
      const job = createSearchJob();
      expect(job.id).toBeDefined();
      expect(job.status).toBe("queued");
      expect(job.progress.stage).toBe("Queued");
      expect(job.progress.percent).toBe(0);
      expect(job.createdAt).toBe(job.updatedAt);
    });
  });

  describe("getSearchJobAbortSignal", () => {
    it("returns an AbortSignal for an existing job", () => {
      const job = createSearchJob();
      const signal = getSearchJobAbortSignal(job.id);
      expect(signal).toBeInstanceOf(AbortSignal);
      expect(signal?.aborted).toBe(false);
    });

    it("returns null for a non-existent job", () => {
      expect(getSearchJobAbortSignal("unknown-id")).toBeNull();
    });
  });

  describe("cancelSearchJob", () => {
    it("cancels a running job and aborts its signal", () => {
      const job = createSearchJob();
      const signal = getSearchJobAbortSignal(job.id);

      const canceledJob = cancelSearchJob(job.id);
      expect(canceledJob?.status).toBe("failed");
      expect(canceledJob?.error).toBe("Search canceled.");
      expect(canceledJob?.progress.stage).toBe("Canceled");
      expect(signal?.aborted).toBe(true);
    });

    it("returns the job unmodified if already completed or failed without aborting again", () => {
      const job = createSearchJob();
      failSearchJob(job.id, "some error");

      const result = cancelSearchJob(job.id);
      expect(result?.status).toBe("failed");
      expect(result?.error).toBe("some error");
      expect(result?.progress.stage).toBe("Failed");
    });

    it("returns null for an unknown job", () => {
      expect(cancelSearchJob("unknown")).toBeNull();
    });
  });

  describe("getSearchJob and getSearchJobWithCheckpoint", () => {
    it("getSearchJob removes resumeCheckpoint", () => {
      const job = createSearchJob();
      const checkpoint: SearchResumeCheckpoint = { lastToken: "token123" } as any;
      updateSearchJobResumeCheckpoint(job.id, checkpoint);

      const fetched = getSearchJob(job.id);
      expect(fetched).not.toHaveProperty("resumeCheckpoint");
    });

    it("getSearchJobWithCheckpoint keeps resumeCheckpoint", () => {
      const job = createSearchJob();
      const checkpoint: SearchResumeCheckpoint = { lastToken: "token123" } as any;
      updateSearchJobResumeCheckpoint(job.id, checkpoint);

      const fetched = getSearchJobWithCheckpoint(job.id);
      expect(fetched?.resumeCheckpoint).toEqual(checkpoint);
    });
  });

  describe("updateSearchJobProgress", () => {
    it("updates progress and changes status to running", () => {
      const job = createSearchJob();
      const progress: SearchProgress = {
        stage: "Running",
        detail: "fetching",
        completedSteps: 1,
        totalSteps: 2,
        percent: 50
      };

      const updatedJob = updateSearchJobProgress(job.id, progress);
      expect(updatedJob?.status).toBe("running");
      expect(updatedJob?.progress).toEqual(progress);
    });

    it("does not update if job is completed or failed", () => {
      const job = createSearchJob();
      failSearchJob(job.id, "error");

      const progress: SearchProgress = {
        stage: "Running",
        detail: "fetching",
        completedSteps: 1,
        totalSteps: 2,
        percent: 50
      };

      const updatedJob = updateSearchJobProgress(job.id, progress);
      expect(updatedJob?.status).toBe("failed"); // should not be running
    });
  });

  describe("updateSearchJobResumeCheckpoint", () => {
    it("updates the resume checkpoint", () => {
      const job = createSearchJob();
      const checkpoint = { foo: "bar" } as any;
      const updated = updateSearchJobResumeCheckpoint(job.id, checkpoint);
      expect(updated?.resumeCheckpoint).toEqual(checkpoint);
    });
  });

  describe("completeSearchJob", () => {
    it("completes a job and updates summary", () => {
      const job = createSearchJob();
      const summary: SearchSummary = { flights: [] } as any;

      const completedJob = completeSearchJob(job.id, summary);
      expect(completedJob?.status).toBe("completed");
      expect(completedJob?.summary).toEqual(summary);
      expect(completedJob?.progress.stage).toBe("Completed");
      expect(completedJob?.progress.percent).toBe(100);

      // Signal should be removed
      expect(getSearchJobAbortSignal(job.id)).toBeNull();
    });
  });

  describe("failSearchJob", () => {
    it("fails a job and updates error", () => {
      const job = createSearchJob();
      const failedJob = failSearchJob(job.id, "Critical failure");

      expect(failedJob?.status).toBe("failed");
      expect(failedJob?.error).toBe("Critical failure");
      expect(failedJob?.progress.stage).toBe("Failed");

      // Signal should be removed
      expect(getSearchJobAbortSignal(job.id)).toBeNull();
    });

    it("returns unmodified if already completed", () => {
      const job = createSearchJob();
      completeSearchJob(job.id, {} as any);

      const failedJob = failSearchJob(job.id, "Critical failure");
      expect(failedJob?.status).toBe("completed");
      expect(failedJob?.error).toBeUndefined();
    });
  });

  describe("pruneJobs", () => {
    it("prunes old jobs when calling createSearchJob", () => {
      const job = createSearchJob();

      // Advance time by 31 minutes
      vi.advanceTimersByTime(1000 * 60 * 31);

      // Calling createSearchJob will trigger pruning
      const job2 = createSearchJob();

      // Check if job 1 is pruned
      expect(getSearchJob(job.id)).toBeNull();
      expect(getSearchJob(job2.id)).toBeDefined();
    });

    it("prunes old jobs when calling getSearchJob", () => {
      const job = createSearchJob();

      // Advance time by 31 minutes
      vi.advanceTimersByTime(1000 * 60 * 31);

      // Calling getSearchJob will trigger pruning and return null
      expect(getSearchJob(job.id)).toBeNull();
    });
  });
});
