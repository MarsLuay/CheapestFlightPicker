import { describe, expect, it } from "vitest";
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
import type { SearchProgress, SearchResumeCheckpoint, SearchSummary } from "../shared/types";

describe("search-jobs", () => {
  it("creates a search job with initial state", () => {
    const job = createSearchJob();
    expect(job).toBeDefined();
    expect(job.id).toBeTypeOf("string");
    expect(job.status).toBe("queued");
    expect(job.progress.stage).toBe("Queued");
    expect(job.progress.percent).toBe(0);

    // Check that abort signal is available
    const signal = getSearchJobAbortSignal(job.id);
    expect(signal).toBeInstanceOf(AbortSignal);
  });

  it("returns null for unknown job abort signal", () => {
    const signal = getSearchJobAbortSignal("unknown-id");
    expect(signal).toBeNull();
  });

  it("cancels an active search job", () => {
    const job = createSearchJob();
    const signal = getSearchJobAbortSignal(job.id)!;

    expect(signal.aborted).toBe(false);

    const cancelledJob = cancelSearchJob(job.id);
    expect(cancelledJob).toBeDefined();
    expect(cancelledJob?.status).toBe("failed");
    expect(cancelledJob?.error).toBe("Search canceled.");
    expect(cancelledJob?.progress.stage).toBe("Canceled");

    // Signal should now be aborted
    expect(signal.aborted).toBe(true);

    // Abort controller should be deleted
    expect(getSearchJobAbortSignal(job.id)).toBeNull();
  });

  it("returns null when canceling an unknown job", () => {
    expect(cancelSearchJob("unknown-id")).toBeNull();
  });

  it("does not alter completed or failed jobs when canceling", () => {
    const job = createSearchJob();
    const failedJob = failSearchJob(job.id, "Some error");
    expect(failedJob?.status).toBe("failed");

    const cancelledJob = cancelSearchJob(job.id);
    expect(cancelledJob?.status).toBe("failed");
    expect(cancelledJob?.error).toBe("Some error");
    expect(cancelledJob?.progress.stage).toBe("Failed");
  });

  it("gets search job and strips resume checkpoint", () => {
    const job = createSearchJob();
    const checkpoint: SearchResumeCheckpoint = { foo: "bar" } as unknown as SearchResumeCheckpoint;
    updateSearchJobResumeCheckpoint(job.id, checkpoint);

    const retrievedJob = getSearchJob(job.id);
    expect(retrievedJob).toBeDefined();
    // Use type assertion since resumeCheckpoint is not on SearchJobStatus returned to clients, but it is in the type definition if they union it, wait... Let's check shared types if resumeCheckpoint is optional.
    expect((retrievedJob as any).resumeCheckpoint).toBeUndefined();
  });

  it("gets search job with checkpoint and preserves it", () => {
    const job = createSearchJob();
    const checkpoint: SearchResumeCheckpoint = { foo: "bar" } as unknown as SearchResumeCheckpoint;
    updateSearchJobResumeCheckpoint(job.id, checkpoint);

    const retrievedJob = getSearchJobWithCheckpoint(job.id);
    expect(retrievedJob).toBeDefined();
    expect(retrievedJob?.resumeCheckpoint).toEqual(checkpoint);
  });

  it("returns null for getSearchJob with unknown id", () => {
    expect(getSearchJob("unknown")).toBeNull();
    expect(getSearchJobWithCheckpoint("unknown")).toBeNull();
  });

  it("updates search job progress", () => {
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

  it("does not update progress for completed jobs", () => {
    const job = createSearchJob();
    const summary: SearchSummary = { flights: [] } as unknown as SearchSummary;
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
    expect(updatedJob?.progress.percent).toBe(100);
  });

  it("updates resume checkpoint", () => {
    const job = createSearchJob();
    const checkpoint: SearchResumeCheckpoint = { baz: "qux" } as unknown as SearchResumeCheckpoint;
    const updatedJob = updateSearchJobResumeCheckpoint(job.id, checkpoint);
    expect(updatedJob?.resumeCheckpoint).toEqual(checkpoint);
  });

  it("returns null when updating resume checkpoint for unknown job", () => {
    const checkpoint: SearchResumeCheckpoint = { baz: "qux" } as unknown as SearchResumeCheckpoint;
    expect(updateSearchJobResumeCheckpoint("unknown", checkpoint)).toBeNull();
  });

  it("completes a search job", () => {
    const job = createSearchJob();
    const summary: SearchSummary = { flights: [] } as unknown as SearchSummary;

    const completedJob = completeSearchJob(job.id, summary);
    expect(completedJob?.status).toBe("completed");
    expect(completedJob?.summary).toEqual(summary);
    expect(completedJob?.progress.stage).toBe("Completed");
    expect(completedJob?.progress.percent).toBe(100);

    // Abort controller should be deleted
    expect(getSearchJobAbortSignal(job.id)).toBeNull();
  });

  it("returns null when completing an unknown job", () => {
    const summary: SearchSummary = { flights: [] } as unknown as SearchSummary;
    expect(completeSearchJob("unknown", summary)).toBeNull();
  });

  it("fails a search job", () => {
    const job = createSearchJob();
    const failedJob = failSearchJob(job.id, "Something went wrong");

    expect(failedJob?.status).toBe("failed");
    expect(failedJob?.error).toBe("Something went wrong");
    expect(failedJob?.progress.stage).toBe("Failed");
    expect(failedJob?.progress.detail).toBe("Something went wrong");

    // Abort controller should be deleted
    expect(getSearchJobAbortSignal(job.id)).toBeNull();
  });

  it("returns null when failing an unknown job", () => {
    expect(failSearchJob("unknown", "Error")).toBeNull();
  });

  it("does not fail an already completed job", () => {
    const job = createSearchJob();
    const summary: SearchSummary = { flights: [] } as unknown as SearchSummary;
    completeSearchJob(job.id, summary);

    const failedJob = failSearchJob(job.id, "Error");
    expect(failedJob?.status).toBe("completed");
  });
});
