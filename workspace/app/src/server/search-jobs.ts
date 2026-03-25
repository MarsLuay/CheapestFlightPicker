import { randomUUID } from "node:crypto";

import type { SearchJobStatus, SearchProgress, SearchSummary } from "../shared/types";

const jobRetentionMs = 1000 * 60 * 30;
const jobs = new Map<string, SearchJobStatus>();

function nowIso(): string {
  return new Date().toISOString();
}

function pruneJobs(): void {
  const cutoff = Date.now() - jobRetentionMs;

  for (const [id, job] of jobs.entries()) {
    if (new Date(job.updatedAt).getTime() < cutoff) {
      jobs.delete(id);
    }
  }
}

export function createSearchJob(): SearchJobStatus {
  pruneJobs();

  const timestamp = nowIso();
  const job: SearchJobStatus = {
    id: randomUUID(),
    status: "queued",
    createdAt: timestamp,
    updatedAt: timestamp,
    progress: {
      stage: "Queued",
      detail: "Preparing the search job",
      completedSteps: 0,
      totalSteps: 1,
      percent: 0
    }
  };

  jobs.set(job.id, job);
  return job;
}

export function getSearchJob(id: string): SearchJobStatus | null {
  pruneJobs();
  const job = jobs.get(id);
  return job ? { ...job } : null;
}

export function updateSearchJobProgress(
  id: string,
  progress: SearchProgress
): SearchJobStatus | null {
  const job = jobs.get(id);
  if (!job) {
    return null;
  }

  const updatedJob: SearchJobStatus = {
    ...job,
    status: "running",
    updatedAt: nowIso(),
    progress
  };
  jobs.set(id, updatedJob);
  return { ...updatedJob };
}

export function completeSearchJob(
  id: string,
  summary: SearchSummary
): SearchJobStatus | null {
  const job = jobs.get(id);
  if (!job) {
    return null;
  }

  const updatedAt = nowIso();
  const updatedJob: SearchJobStatus = {
    ...job,
    status: "completed",
    updatedAt,
    summary,
    progress: {
      ...job.progress,
      stage: "Completed",
      detail: "Search finished",
      completedSteps: Math.max(job.progress.totalSteps, job.progress.completedSteps),
      totalSteps: Math.max(job.progress.totalSteps, job.progress.completedSteps),
      percent: 100
    }
  };
  jobs.set(id, updatedJob);
  return { ...updatedJob };
}

export function failSearchJob(
  id: string,
  error: string
): SearchJobStatus | null {
  const job = jobs.get(id);
  if (!job) {
    return null;
  }

  const updatedJob: SearchJobStatus = {
    ...job,
    status: "failed",
    updatedAt: nowIso(),
    error,
    progress: {
      ...job.progress,
      stage: "Failed",
      detail: error,
      percent: Math.min(job.progress.percent, 99)
    }
  };
  jobs.set(id, updatedJob);
  return { ...updatedJob };
}
