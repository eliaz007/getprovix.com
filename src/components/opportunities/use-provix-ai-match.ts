"use client";

import { useCallback, useMemo, useState } from "react";
import {
  fetchJobMatches,
  toOpportunityMatchInsight,
  type JobMatchCandidatePayload,
} from "@/lib/job-match";
import { getActiveJobs } from "@/lib/opportunities-metrics";
import { toJobMatchJobPayload, type JobRow } from "@/lib/jobs";
import type { OpportunityMatchResult } from "@/lib/opportunity-match";

export function useProvixAiMatch({
  jobs,
  userId,
  authLoading = false,
  requireAuth,
  candidate,
}: {
  jobs: JobRow[];
  userId: string | null;
  authLoading?: boolean;
  requireAuth: () => boolean;
  candidate: JobMatchCandidatePayload;
}) {
  const [matchInsights, setMatchInsights] = useState<
    Record<string, OpportunityMatchResult>
  >({});
  const [matchLoadingIds, setMatchLoadingIds] = useState<
    Record<string, boolean>
  >({});
  const [aiMatchRunning, setAiMatchRunning] = useState(false);
  const [aiMatchError, setAiMatchError] = useState<string | null>(null);

  const activeJobs = useMemo(() => getActiveJobs(jobs), [jobs]);

  const runAiMatch = useCallback(async () => {
    if (authLoading || aiMatchRunning) {
      return;
    }

    if (!requireAuth() || !userId) {
      return;
    }

    if (activeJobs.length === 0) {
      setAiMatchError("No active job listings to match right now.");
      return;
    }

    const jobsToMatch = activeJobs;
    setAiMatchError(null);
    setAiMatchRunning(true);
    setMatchLoadingIds(
      Object.fromEntries(jobsToMatch.map((job) => [job.id, true]))
    );

    try {
      const { matches } = await fetchJobMatches(
        candidate,
        jobsToMatch.map((job) => toJobMatchJobPayload(job))
      );

      const nextInsights: Record<string, OpportunityMatchResult> = {};
      for (const match of matches) {
        nextInsights[String(match.jobId)] = toOpportunityMatchInsight(match);
      }
      setMatchInsights(nextInsights);
    } catch (err) {
      console.warn("Failed to run Provix AI Match:", err);
      setAiMatchError(
        "Could not complete AI matching. Please try again in a moment."
      );
    } finally {
      setAiMatchRunning(false);
      setMatchLoadingIds({});
    }
  }, [
    activeJobs,
    aiMatchRunning,
    authLoading,
    candidate,
    requireAuth,
    userId,
  ]);

  return {
    matchInsights,
    matchLoadingIds,
    aiMatchRunning,
    aiMatchError,
    runAiMatch,
  };
}
