import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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
  });

  it("createSearchJob should create a new job and an abort controller", () => {
    const job = createSearchJob();
    expect(job).toBeDefined();
    expect(job.id).toBeDefined();
    expect(job.status).toBe("queued");
    expect(job.progress.stage).toBe("Queued");

    const signal = getSearchJobAbortSignal(job.id);
    expect(signal).toBeInstanceOf(AbortSignal);
  });

  it("getSearchJob should return the job without resumeCheckpoint", () => {
    const job = createSearchJob();
    updateSearchJobResumeCheckpoint(job.id, { flightsFound: 5 });

    const retrieved = getSearchJob(job.id);
    expect(retrieved).toBeDefined();
    expect(retrieved?.id).toBe(job.id);
    // @ts-ignore - checking that it's absent
    expect(retrieved?.resumeCheckpoint).toBeUndefined();
  });

  it("getSearchJobWithCheckpoint should return the job with resumeCheckpoint", () => {
    const job = createSearchJob();
    const checkpoint = { flightsFound: 5 };
    updateSearchJobResumeCheckpoint(job.id, checkpoint);

    const retrieved = getSearchJobWithCheckpoint(job.id);
    expect(retrieved).toBeDefined();
    expect(retrieved?.id).toBe(job.id);
    expect(retrieved?.resumeCheckpoint).toEqual(checkpoint);
  });

  it("cancelSearchJob should abort the controller and update job status", () => {
    const job = createSearchJob();
    const signal = getSearchJobAbortSignal(job.id);
    expect(signal?.aborted).toBe(false);

    const canceled = cancelSearchJob(job.id);
    expect(canceled).toBeDefined();
    expect(canceled?.status).toBe("failed");
    expect(canceled?.error).toBe("Search canceled.");
    expect(canceled?.progress.stage).toBe("Canceled");

    expect(signal?.aborted).toBe(true);

    // Controller should be deleted
    expect(getSearchJobAbortSignal(job.id)).toBeNull();
  });

  it("cancelSearchJob should return unmodified if already completed", () => {
    const job = createSearchJob();
    completeSearchJob(job.id, { totalFlights: 10 });

    const canceled = cancelSearchJob(job.id);
    expect(canceled?.status).toBe("completed");
    expect(canceled?.error).toBeUndefined();
  });

  it("updateSearchJobProgress should update progress and set status to running", () => {
    const job = createSearchJob();
    const progress = {
      stage: "Searching",
      detail: "Looking for flights",
      completedSteps: 1,
      totalSteps: 2,
      percent: 50
    };

    const updated = updateSearchJobProgress(job.id, progress);
    expect(updated?.status).toBe("running");
    expect(updated?.progress).toEqual(progress);
  });

  it("completeSearchJob should update status to completed and set summary", () => {
    const job = createSearchJob();
    const summary = { totalFlights: 10 };

    const completed = completeSearchJob(job.id, summary);
    expect(completed?.status).toBe("completed");
    expect(completed?.summary).toEqual(summary);
    expect(completed?.progress.stage).toBe("Completed");
    expect(completed?.progress.percent).toBe(100);

    // Controller should be deleted
    expect(getSearchJobAbortSignal(job.id)).toBeNull();
  });

  it("failSearchJob should update status to failed and set error", () => {
    const job = createSearchJob();
    const failed = failSearchJob(job.id, "Something went wrong");

    expect(failed?.status).toBe("failed");
    expect(failed?.error).toBe("Something went wrong");
    expect(failed?.progress.stage).toBe("Failed");

    // Controller should be deleted
    expect(getSearchJobAbortSignal(job.id)).toBeNull();
  });

  it("should prune jobs older than retention period", () => {
    // 30 minutes in milliseconds
    const thirtyMins = 1000 * 60 * 30;

    // Create job at current mock time
    const job1 = createSearchJob();
    expect(getSearchJob(job1.id)).not.toBeNull();

    // Advance time by 31 minutes
    vi.advanceTimersByTime(thirtyMins + 1000);

    // Creating a new job triggers pruning
    const job2 = createSearchJob();

    // job1 should be pruned, job2 should exist
    expect(getSearchJob(job1.id)).toBeNull();
    expect(getSearchJob(job2.id)).not.toBeNull();
  });

  it("non-existent jobs should return null for relevant functions", () => {
    const fakeId = "fake-uuid";
    expect(getSearchJob(fakeId)).toBeNull();
    expect(getSearchJobAbortSignal(fakeId)).toBeNull();
    expect(cancelSearchJob(fakeId)).toBeNull();
    expect(getSearchJobWithCheckpoint(fakeId)).toBeNull();
    expect(updateSearchJobProgress(fakeId, { stage: "Test", detail: "", completedSteps: 0, totalSteps: 1, percent: 0 })).toBeNull();
    expect(updateSearchJobResumeCheckpoint(fakeId, {})).toBeNull();
    expect(completeSearchJob(fakeId, { totalFlights: 0 })).toBeNull();
    expect(failSearchJob(fakeId, "error")).toBeNull();
  });
});
