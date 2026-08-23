import { describe, expect, it, beforeEach, vi, afterEach } from "vitest";

import {
  createSearchJob,
  getSearchJob,
  getSearchJobWithCheckpoint,
  cancelSearchJob,
  updateSearchJobProgress,
  updateSearchJobResumeCheckpoint,
  completeSearchJob,
  failSearchJob,
  getSearchJobAbortSignal
} from "./search-jobs";

import type {
  SearchProgress,
  SearchResumeCheckpoint,
  SearchSummary
} from "../shared/types";

describe("search-jobs", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should create a search job", () => {
    const job = createSearchJob();
    expect(job).toBeDefined();
    expect(job.id).toBeDefined();
    expect(job.status).toBe("queued");
    expect(job.progress.stage).toBe("Queued");
    expect(job.progress.percent).toBe(0);
  });

  it("should get a search job without checkpoint", () => {
    const createdJob = createSearchJob();
    const resumeCheckpoint: SearchResumeCheckpoint = {
      handledLegs: [],
      pendingLegs: []
    };
    updateSearchJobResumeCheckpoint(createdJob.id, resumeCheckpoint);

    const job = getSearchJob(createdJob.id);
    expect(job).toBeDefined();
    expect((job as any).resumeCheckpoint).toBeUndefined();
  });

  it("should get a search job with checkpoint", () => {
    const createdJob = createSearchJob();
    const resumeCheckpoint: SearchResumeCheckpoint = {
      handledLegs: [],
      pendingLegs: []
    };
    updateSearchJobResumeCheckpoint(createdJob.id, resumeCheckpoint);

    const job = getSearchJobWithCheckpoint(createdJob.id);
    expect(job).toBeDefined();
    expect(job?.resumeCheckpoint).toEqual(resumeCheckpoint);
  });

  it("should update search job progress", () => {
    const createdJob = createSearchJob();
    const progress: SearchProgress = {
      stage: "Searching",
      detail: "Searching for flights",
      completedSteps: 1,
      totalSteps: 2,
      percent: 50
    };

    const updatedJob = updateSearchJobProgress(createdJob.id, progress);
    expect(updatedJob).toBeDefined();
    expect(updatedJob?.status).toBe("running");
    expect(updatedJob?.progress).toEqual(progress);
  });

  it("should not update progress if job is completed", () => {
    const createdJob = createSearchJob();
    completeSearchJob(createdJob.id, {
      cheapestRoundTrips: [],
      dateWindowStats: { start: "", end: "", numDays: 1, combinations: 1 }
    });

    const progress: SearchProgress = {
      stage: "Searching",
      detail: "Searching for flights",
      completedSteps: 1,
      totalSteps: 2,
      percent: 50
    };
    const updatedJob = updateSearchJobProgress(createdJob.id, progress);
    expect(updatedJob?.status).toBe("completed");
    expect(updatedJob?.progress.percent).toBe(100);
  });

  it("should complete search job", () => {
    const createdJob = createSearchJob();
    const summary: SearchSummary = {
      cheapestRoundTrips: [],
      dateWindowStats: { start: "", end: "", numDays: 1, combinations: 1 }
    };

    const completedJob = completeSearchJob(createdJob.id, summary);
    expect(completedJob).toBeDefined();
    expect(completedJob?.status).toBe("completed");
    expect(completedJob?.summary).toEqual(summary);
    expect(completedJob?.progress.stage).toBe("Completed");
    expect(completedJob?.progress.percent).toBe(100);
  });

  it("should fail search job", () => {
    const createdJob = createSearchJob();
    const errorMessage = "Something went wrong";

    const failedJob = failSearchJob(createdJob.id, errorMessage);
    expect(failedJob).toBeDefined();
    expect(failedJob?.status).toBe("failed");
    expect(failedJob?.error).toBe(errorMessage);
    expect(failedJob?.progress.stage).toBe("Failed");
    expect(failedJob?.progress.detail).toBe(errorMessage);
  });

  it("should not fail job if already completed", () => {
    const createdJob = createSearchJob();
    completeSearchJob(createdJob.id, {
      cheapestRoundTrips: [],
      dateWindowStats: { start: "", end: "", numDays: 1, combinations: 1 }
    });

    const failedJob = failSearchJob(createdJob.id, "Error after completion");
    expect(failedJob?.status).toBe("completed");
    expect(failedJob?.error).toBeUndefined();
  });

  it("should cancel search job", () => {
    const createdJob = createSearchJob();

    const canceledJob = cancelSearchJob(createdJob.id);
    expect(canceledJob).toBeDefined();
    expect(canceledJob?.status).toBe("failed");
    expect(canceledJob?.error).toBe("Search canceled.");
    expect(canceledJob?.progress.stage).toBe("Canceled");
  });

  it("should provide an abort signal", () => {
    const createdJob = createSearchJob();
    const signal = getSearchJobAbortSignal(createdJob.id);

    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal?.aborted).toBe(false);

    cancelSearchJob(createdJob.id);
    expect(signal?.aborted).toBe(true);
  });

  it("should return null for abort signal if job doesn't exist", () => {
    const signal = getSearchJobAbortSignal("nonexistent-id");
    expect(signal).toBeNull();
  });

  it("should prune old jobs", () => {
    const job = createSearchJob();
    expect(getSearchJob(job.id)).toBeDefined();

    // Advance time beyond jobRetentionMs (1000 * 60 * 30 = 1800000)
    vi.advanceTimersByTime(1800001);

    // Call createSearchJob to trigger pruneJobs()
    createSearchJob();

    // Verify the old job was pruned
    expect(getSearchJob(job.id)).toBeNull();
  });
});
