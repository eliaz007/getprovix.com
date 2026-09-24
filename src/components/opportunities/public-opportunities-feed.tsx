"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useDashboardNav } from "@/components/dashboard/dashboard-nav-context";
import OpportunitiesJobFeed from "@/components/opportunities/opportunities-job-feed";
import { submitCandidateJobInterest } from "@/lib/job-interest";
import { extractAuditedSkills, parseExperienceTier } from "@/lib/job-match";
import { fetchPublicJobFeed, type JobRow } from "@/lib/jobs";
import { fetchProfileForCandidateId } from "@/lib/resolve-candidate-profile";
import { useProvixAiMatch } from "@/components/opportunities/use-provix-ai-match";
import { createClient } from "@/utils/supabase/client";
import Toast, { inferToastVariant, type ToastVariant } from "@/components/Toast";

type CandidateMatchProfile = {
  skills: string[] | string;
  experienceTier: string;
  githubUrl: string;
  githubAudit: unknown;
};

function candidateFromProfileRow(
  row: Record<string, unknown> | null
): CandidateMatchProfile {
  const auditData = row?.audit_data;
  const githubAudit =
    auditData &&
    typeof auditData === "object" &&
    "github_audit" in (auditData as object)
      ? (auditData as { github_audit?: unknown }).github_audit
      : auditData;

  const payload = {
    skills: row?.skills as string[] | string | undefined,
    experienceTier:
      typeof row?.experience_level === "string" ? row.experience_level : "",
    githubUrl:
      (typeof row?.portfolio_url === "string" && row.portfolio_url) ||
      (typeof row?.github_url === "string" && row.github_url) ||
      "",
    githubAudit,
  };

  return {
    skills: extractAuditedSkills(payload),
    experienceTier: parseExperienceTier(payload),
    githubUrl: payload.githubUrl,
    githubAudit,
  };
}

export default function PublicOpportunitiesFeed() {
  const { requireAuth, userId, authLoading } = useDashboardNav();
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [appliedJobIds, setAppliedJobIds] = useState<string[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastVariant, setToastVariant] = useState<ToastVariant>("success");
  const [candidateProfile, setCandidateProfile] =
    useState<CandidateMatchProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);

  const matchCandidate = useMemo(
    () => ({
      skills: candidateProfile?.skills ?? [],
      experienceTier: candidateProfile?.experienceTier ?? "",
      githubUrl: candidateProfile?.githubUrl ?? "",
      githubAudit: candidateProfile?.githubAudit,
    }),
    [candidateProfile]
  );

  const {
    matchInsights,
    matchLoadingIds,
    aiMatchRunning,
    aiMatchError,
    runAiMatch,
  } = useProvixAiMatch({
    jobs,
    userId,
    authLoading,
    requireAuth,
    candidate: matchCandidate,
  });

  const showToast = useCallback((message: string, variant?: ToastVariant) => {
    setToastMessage(message);
    setToastVariant(variant ?? inferToastVariant(message));
    window.setTimeout(() => setToastMessage(null), 3200);
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadJobs = async () => {
      try {
        const { data, error } = await fetchPublicJobFeed(createClient());

        if (!isMounted) {
          return;
        }

        if (error) {
          console.error(
            "Failed to fetch public jobs:",
            error.message,
            error.details,
            error.hint
          );
          setJobs([]);
        } else {
          setJobs(data);
        }
      } catch (err) {
        console.error("Failed to fetch public jobs:", err);
        if (isMounted) {
          setJobs([]);
        }
      } finally {
        if (isMounted) {
          setJobsLoading(false);
        }
      }
    };

    void loadJobs();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!userId) {
      setAppliedJobIds([]);
      setCandidateProfile(null);
      setLoadingProfile(false);
      return;
    }

    let isMounted = true;
    const supabase = createClient();
    setLoadingProfile(true);

    const loadCandidate = async () => {
      const startedAt =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      try {
        const [{ data, error }, profile] = await Promise.all([
          supabase
            .from("job_applications")
            .select("job_id")
            .eq("candidate_id", userId)
            .limit(100),
          fetchProfileForCandidateId(
            supabase,
            userId,
            "skills, experience_level, portfolio_url, github_url"
          ),
        ]);

        if (!isMounted) {
          return;
        }

        const ms = Math.round(
          (typeof performance !== "undefined" ? performance.now() : Date.now()) -
            startedAt
        );
        console.info("[opportunities] candidate context", {
          ms,
          applications: data?.length ?? 0,
          hasProfile: Boolean(profile),
          error: error?.message ?? null,
        });

        if (error) {
          console.error("Failed to fetch job applications:", error);
        } else {
          setAppliedJobIds((data ?? []).map((row) => row.job_id));
        }

        setCandidateProfile(candidateFromProfileRow(profile));
      } catch (err) {
        if (!isMounted) {
          return;
        }
        console.error("Failed to load candidate match profile:", err);
      } finally {
        if (isMounted) {
          setLoadingProfile(false);
        }
      }
    };

    void loadCandidate();

    return () => {
      isMounted = false;
    };
  }, [userId]);

  const handleExpressInterest = async (job: JobRow) => {
    if (authLoading) {
      return;
    }

    if (!requireAuth() || !userId) {
      return;
    }

    if (appliedJobIds.includes(job.id)) {
      return;
    }

    setAppliedJobIds((prev) => [...prev, job.id]);
    showToast("Interest sent. The employer will review your profile.");

    try {
      const result = await submitCandidateJobInterest(job.id);
      if (result.alreadyApplied) {
        return;
      }
    } catch (err) {
      console.error("Failed to submit job interest:", err);
      setAppliedJobIds((prev) => prev.filter((id) => id !== job.id));
      showToast("Could not submit interest. Please try again.");
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto">
      <OpportunitiesJobFeed
        jobs={jobs}
        jobsLoading={jobsLoading}
        isGuest={!userId}
        appliedJobIds={appliedJobIds}
        onExpressInterest={handleExpressInterest}
        matchInsights={matchInsights}
        matchLoadingIds={matchLoadingIds}
        candidateSkills={
          Array.isArray(candidateProfile?.skills)
            ? candidateProfile.skills
            : []
        }
        loadingProfile={loadingProfile}
        enableAiMatch
        aiMatchRunning={aiMatchRunning}
        aiMatchError={aiMatchError}
        onRunAiMatch={runAiMatch}
      />
      <Toast
        message={toastMessage}
        variant={toastVariant}
        className="bottom-6 left-1/2 -translate-x-1/2 z-[80]"
      />
    </div>
  );
}
