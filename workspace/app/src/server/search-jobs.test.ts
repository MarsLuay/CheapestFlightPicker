import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import {
  createSearchJob,
  getSearchJobAbortSignal,
  cancelSearchJob,
  getSearchJob,
  getSearchJobWithCheckpoint,
  updateSearchJobProgress,
  updateSearchJobResumeCheckpoint,
  completeSearchJob,
  failSearchJob
} from "./search-jobs";

describe("search-jobs", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("createSearchJob", () => {
    it("creates a new queued job and sets an abort controller", () => {
      const job = createSearchJob();

      expect(job.status).toBe("queued");
      expect(job.progress.stage).toBe("Queued");
      expect(job.progress.percent).toBe(0);

      const signal = getSearchJobAbortSignal(job.id);
      expect(signal).toBeInstanceOf(AbortSignal);
      expect(signal?.aborted).toBe(false);
    });
  });

  describe("getSearchJob", () => {
    it("returns null for unknown job", () => {
      expect(getSearchJob("unknown-id")).toBeNull();
    });

    it("returns public job data", () => {
      const job = createSearchJob();
      updateSearchJobResumeCheckpoint(job.id, {
        state: "somestate",
        cursor: "cursor-1"
      } as any);

      const fetched = getSearchJob(job.id);
      expect(fetched).not.toBeNull();
      // Ensure resumeCheckpoint is not present
      expect((fetched as any).resumeCheckpoint).toBeUndefined();
    });
  });

  describe("getSearchJobWithCheckpoint", () => {
    it("returns null for unknown job", () => {
      expect(getSearchJobWithCheckpoint("unknown-id")).toBeNull();
    });

    it("returns full job data including checkpoint", () => {
      const job = createSearchJob();
      updateSearchJobResumeCheckpoint(job.id, {
        state: "somestate",
        cursor: "cursor-1"
      } as any);

      const fetched = getSearchJobWithCheckpoint(job.id);
      expect(fetched).not.toBeNull();
      expect(fetched?.resumeCheckpoint).toEqual({
        state: "somestate",
        cursor: "cursor-1"
      });
    });
  });

  describe("updateSearchJobProgress", () => {
    it("updates progress and sets status to running", () => {
      const job = createSearchJob();

      const updated = updateSearchJobProgress(job.id, {
        stage: "Searching",
        detail: "Looking for flights",
        completedSteps: 1,
        totalSteps: 2,
        percent: 50
      });

      expect(updated).not.toBeNull();
      expect(updated?.status).toBe("running");
      expect(updated?.progress.stage).toBe("Searching");
      expect(updated?.progress.percent).toBe(50);
    });

    it("returns null for unknown job", () => {
      expect(updateSearchJobProgress("unknown-id", {} as any)).toBeNull();
    });

    it("does not update if job is already completed", () => {
      const job = createSearchJob();
      completeSearchJob(job.id, {} as any);

      const updated = updateSearchJobProgress(job.id, {
        stage: "Searching",
        detail: "Looking for flights",
        completedSteps: 1,
        totalSteps: 2,
        percent: 50
      });

      expect(updated?.status).toBe("completed");
      expect(updated?.progress.stage).toBe("Completed"); // From completeSearchJob
    });
  });

  describe("cancelSearchJob", () => {
    it("cancels a queued or running job, sets status to failed, and aborts signal", () => {
      const job = createSearchJob();
      const signal = getSearchJobAbortSignal(job.id);

      const canceledJob = cancelSearchJob(job.id);

      expect(canceledJob).not.toBeNull();
      expect(canceledJob?.status).toBe("failed");
      expect(canceledJob?.error).toBe("Search canceled.");
      expect(canceledJob?.progress.stage).toBe("Canceled");
      expect(signal?.aborted).toBe(true);

      // Verify that the abort controller was removed
      expect(getSearchJobAbortSignal(job.id)).toBeNull();
    });

    it("returns null for unknown job", () => {
      expect(cancelSearchJob("unknown-id")).toBeNull();
    });

    it("does not modify already completed jobs", () => {
      const job = createSearchJob();
      completeSearchJob(job.id, { cheapestOptions: [] } as any);

      const result = cancelSearchJob(job.id);

      expect(result?.status).toBe("completed");
    });
  });

  describe("completeSearchJob", () => {
    it("completes a job and sets summary", () => {
      const job = createSearchJob();

      const completed = completeSearchJob(job.id, {
        cheapestOptions: []
      } as any);

      expect(completed).not.toBeNull();
      expect(completed?.status).toBe("completed");
      expect(completed?.progress.percent).toBe(100);
      expect(completed?.summary).toEqual({ cheapestOptions: [] });

      // Verify abort controller is removed
      expect(getSearchJobAbortSignal(job.id)).toBeNull();
    });

    it("returns null for unknown job", () => {
      expect(completeSearchJob("unknown-id", {} as any)).toBeNull();
    });
  });

  describe("failSearchJob", () => {
    it("fails a job and sets error message", () => {
      const job = createSearchJob();

      const failed = failSearchJob(job.id, "Something went wrong");

      expect(failed).not.toBeNull();
      expect(failed?.status).toBe("failed");
      expect(failed?.error).toBe("Something went wrong");
      expect(failed?.progress.stage).toBe("Failed");

      // Verify abort controller is removed
      expect(getSearchJobAbortSignal(job.id)).toBeNull();
    });

    it("returns null for unknown job", () => {
      expect(failSearchJob("unknown-id", "error")).toBeNull();
    });

    it("does not overwrite if already failed", () => {
      const job = createSearchJob();
      failSearchJob(job.id, "First error");

      const result = failSearchJob(job.id, "Second error");

      expect(result?.error).toBe("First error");
    });
  });

  describe("pruneJobs", () => {
    it("removes jobs older than the retention limit when new jobs are created or accessed", () => {
      const job = createSearchJob();

      // Advance time by slightly more than 30 minutes (the hardcoded retention in search-jobs.ts)
      vi.advanceTimersByTime(1000 * 60 * 30 + 1000);

      // Now accessing the job or creating a new one should trigger pruning
      const fetched = getSearchJob(job.id);
      expect(fetched).toBeNull();
    });
  });
});
