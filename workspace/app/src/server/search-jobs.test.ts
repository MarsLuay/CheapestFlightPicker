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
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("should create a new search job", () => {
    const job = createSearchJob();
    expect(job).toBeDefined();
    expect(job.status).toBe("queued");
    expect(job.id).toBeTypeOf("string");
    expect(job.progress.stage).toBe("Queued");
  });

  it("should return the abort signal for a job", () => {
    const job = createSearchJob();
    const signal = getSearchJobAbortSignal(job.id);
    expect(signal).toBeInstanceOf(AbortSignal);
  });

  it("should return null for an abort signal of non-existent job", () => {
    const signal = getSearchJobAbortSignal("invalid-id");
    expect(signal).toBeNull();
  });

  it("should cancel a search job", () => {
    const job = createSearchJob();
    const canceledJob = cancelSearchJob(job.id);
    expect(canceledJob).toBeDefined();
    expect(canceledJob?.status).toBe("failed");
    expect(canceledJob?.error).toBe("Search canceled.");
    expect(canceledJob?.progress.stage).toBe("Canceled");
  });

  it("should return null when cancelling a non-existent job", () => {
    expect(cancelSearchJob("invalid-id")).toBeNull();
  });

  it("should get a search job without resume checkpoint", () => {
    const job = createSearchJob();
    updateSearchJobResumeCheckpoint(job.id, {
      pendingLegs: [],
      scrapedFlights: [],
      status: "running"
    });

    const retrievedJob = getSearchJob(job.id);
    expect(retrievedJob).toBeDefined();
    expect(retrievedJob?.id).toBe(job.id);
    expect((retrievedJob as any).resumeCheckpoint).toBeUndefined();
  });

  it("should get a search job with resume checkpoint", () => {
    const job = createSearchJob();
    updateSearchJobResumeCheckpoint(job.id, {
      pendingLegs: [],
      scrapedFlights: [],
      status: "running"
    });

    const retrievedJob = getSearchJobWithCheckpoint(job.id);
    expect(retrievedJob).toBeDefined();
    expect(retrievedJob?.id).toBe(job.id);
    expect(retrievedJob?.resumeCheckpoint).toBeDefined();
  });

  it("should update search job progress", () => {
    const job = createSearchJob();
    const updatedJob = updateSearchJobProgress(job.id, {
      stage: "Running",
      detail: "Searching",
      completedSteps: 1,
      totalSteps: 5,
      percent: 20
    });

    expect(updatedJob).toBeDefined();
    expect(updatedJob?.status).toBe("running");
    expect(updatedJob?.progress.stage).toBe("Running");
    expect(updatedJob?.progress.percent).toBe(20);
  });

  it("should complete a search job", () => {
    const job = createSearchJob();
    const summary = {
      cheapestFlight: null,
      bestFlight: null,
      flights: [],
      totalFlights: 0,
      searchDurationMs: 100
    };

    const completedJob = completeSearchJob(job.id, summary);
    expect(completedJob).toBeDefined();
    expect(completedJob?.status).toBe("completed");
    expect(completedJob?.summary).toEqual(summary);
    expect(completedJob?.progress.stage).toBe("Completed");
    expect(completedJob?.progress.percent).toBe(100);
  });

  it("should fail a search job", () => {
    const job = createSearchJob();
    const failedJob = failSearchJob(job.id, "Something went wrong");

    expect(failedJob).toBeDefined();
    expect(failedJob?.status).toBe("failed");
    expect(failedJob?.error).toBe("Something went wrong");
    expect(failedJob?.progress.stage).toBe("Failed");
    expect(failedJob?.progress.detail).toBe("Something went wrong");
  });

  it("should prune old jobs", () => {
    const job = createSearchJob();

    // Advance time by 31 minutes (retention is 30 mins)
    vi.advanceTimersByTime(31 * 60 * 1000);

    // Trigger pruneJobs via createSearchJob
    createSearchJob();

    const retrievedJob = getSearchJob(job.id);
    expect(retrievedJob).toBeNull();
  });
});
