"use client";

import { useCallback, useEffect, useState } from "react";
import { useDashboardNav } from "@/components/dashboard/dashboard-nav-context";
import OpportunitiesJobFeed from "@/components/opportunities/opportunities-job-feed";
import { createEmployerNotification } from "@/lib/employer-notifications";
import { fetchPublicJobFeed, type JobRow } from "@/lib/jobs";
import { createClient } from "@/utils/supabase/client";
import Toast, { inferToastVariant, type ToastVariant } from "@/components/Toast";

export default function PublicOpportunitiesFeed() {
  const { requireAuth, userId, authLoading } = useDashboardNav();
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [appliedJobIds, setAppliedJobIds] = useState<string[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastVariant, setToastVariant] = useState<ToastVariant>("success");

  const showToast = useCallback((message: string, variant?: ToastVariant) => {
    setToastMessage(message);
    setToastVariant(variant ?? inferToastVariant(message));
    window.setTimeout(() => setToastMessage(null), 3200);
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadJobs = async () => {
      const { data, error } = await fetchPublicJobFeed();
      if (!isMounted) {
        return;
      }

      if (error) {
        console.error("Failed to fetch public jobs:", error);
        setJobs([]);
      } else {
        setJobs(data);
      }
      setJobsLoading(false);
    };

    void loadJobs();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!userId) {
      setAppliedJobIds([]);
      return;
    }

    let isMounted = true;
    const supabase = createClient();

    void supabase
      .from("job_applications")
      .select("job_id")
      .eq("candidate_id", userId)
      .then(({ data, error }) => {
        if (!isMounted) {
          return;
        }
        if (error) {
          console.error("Failed to fetch job applications:", error);
          return;
        }
        setAppliedJobIds((data ?? []).map((row) => row.job_id));
      });

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
    showToast(
      "Interest submitted. The team will review your proof-of-work dossier."
    );

    const supabase = createClient();
    const { error } = await supabase.from("job_applications").insert({
      job_id: job.id,
      candidate_id: userId,
    });

    if (error) {
      console.error("Failed to submit job interest:", error);
      setAppliedJobIds((prev) => prev.filter((id) => id !== job.id));

      if (error.code === "23505") {
        setAppliedJobIds((prev) =>
          prev.includes(job.id) ? prev : [...prev, job.id]
        );
        return;
      }

      showToast("Could not submit interest. Please try again.");
      return;
    }

    if (job.employer_id && job.employer_id !== userId) {
      await createEmployerNotification(supabase, {
        userId: job.employer_id,
        jobId: job.id,
        message: `A candidate expressed interest in your role: ${job.title ?? "Open Role"}`,
      });
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
      />
      <Toast
        message={toastMessage}
        variant={toastVariant}
        className="bottom-6 left-1/2 -translate-x-1/2 z-[80]"
      />
    </div>
  );
}
