"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Trash2, X } from "lucide-react";
import Toast from "@/components/Toast";
import { useDashboardNav } from "@/components/dashboard/dashboard-nav-context";
import { CANDIDATE_DASHBOARD_PATH } from "@/lib/account-role";
import { isMissingCompanyName } from "@/lib/company-name";
import {
  JOB_CONTRACT_BANDWIDTH_OPTIONS,
  normalizeContractHoursPerWeek,
  type ContractHoursPerWeek,
} from "@/lib/contract-availability";
import { dashboardTabHref } from "@/lib/dashboard-account";
import { formatSalaryRange } from "@/lib/format-salary-range";
import {
  employmentTypeFromJobType,
  fetchDashboardJobs,
  jobDisplayTags,
  parseJobListInput,
  type JobEngagementType,
  type JobRow,
} from "@/lib/jobs";
import { readJsonResponse } from "@/lib/read-json-response";
import { isSupabaseSchemaError } from "@/lib/supabase-schema-errors";
import { createClient } from "@/utils/supabase/client";

type ListingRow = {
  id: string;
  title: string;
  company: string | null;
  location: string | null;
  employmentType: string | null;
  applicants: number;
  status: "Active" | "Paused";
};

function toListing(job: JobRow, applicants: number): ListingRow {
  return {
    id: job.id,
    title: job.title?.trim() || "Untitled Role",
    company: job.company,
    location: job.location,
    employmentType: job.employment_type ?? null,
    applicants,
    status: job.status === "paused" ? "Paused" : "Active",
  };
}

export default function EmployerJobPostings() {
  const router = useRouter();
  const {
    accountRole,
    authLoading,
    companyName,
    isBusinessAccount,
    isVerifiedEmployer,
    userId,
  } = useDashboardNav();

  const rolePending = authLoading || (userId != null && accountRole == null);
  const companyForNewJob = isMissingCompanyName(companyName)
    ? ""
    : (companyName ?? "").trim();

  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [interestCounts, setInterestCounts] = useState<Record<string, number>>(
    {}
  );
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [postOpen, setPostOpen] = useState(false);
  const [isCreatingJob, setIsCreatingJob] = useState(false);
  const [engagementType, setEngagementType] =
    useState<JobEngagementType>("full_time");
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [location, setLocation] = useState("");
  const [salaryRange, setSalaryRange] = useState("");
  const [contractHours, setContractHours] = useState<ContractHoursPerWeek | "">(
    ""
  );
  const [hourlyRateRange, setHourlyRateRange] = useState("");
  const [requiredSkills, setRequiredSkills] = useState("");
  const [techStack, setTechStack] = useState("");

  const showToast = (message: string) => {
    setToastMessage(message);
    window.setTimeout(() => {
      setToastMessage((current) => (current === message ? null : current));
    }, 3200);
  };

  const resetForm = useCallback(() => {
    setEngagementType("full_time");
    setTitle("");
    setCompany(companyForNewJob);
    setLocation("");
    setSalaryRange("");
    setContractHours("");
    setHourlyRateRange("");
    setRequiredSkills("");
    setTechStack("");
  }, [companyForNewJob]);

  useEffect(() => {
    if (rolePending) {
      return;
    }
    if (!isBusinessAccount) {
      router.replace(CANDIDATE_DASHBOARD_PATH);
    }
  }, [isBusinessAccount, rolePending, router]);

  const loadListings = useCallback(async () => {
    if (!userId) {
      setJobs([]);
      setInterestCounts({});
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError(null);
    const supabase = createClient();

    try {
      const { data, error } = await fetchDashboardJobs(supabase);
      if (error) {
        throw new Error(error.message);
      }

      const owned = data.filter((job) => job.employer_id === userId);
      setJobs(owned);

      if (owned.length === 0) {
        setInterestCounts({});
        return;
      }

      const { data: applications, error: interestError } = await supabase
        .from("job_applications")
        .select("job_id")
        .in(
          "job_id",
          owned.map((job) => job.id)
        );

      if (interestError) {
        console.error("Failed to fetch job interest counts:", interestError);
        return;
      }

      const counts: Record<string, number> = {};
      for (const row of applications ?? []) {
        const jobId = row.job_id;
        if (typeof jobId !== "string") {
          continue;
        }
        counts[jobId] = (counts[jobId] ?? 0) + 1;
      }
      setInterestCounts(counts);
    } catch (error) {
      console.error("Failed to load employer jobs:", error);
      setJobs([]);
      setLoadError("Could not load your job postings. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (rolePending || !isBusinessAccount) {
      return;
    }
    void loadListings();
  }, [isBusinessAccount, loadListings, rolePending]);

  const listings = jobs.map((job) =>
    toListing(job, interestCounts[job.id] ?? 0)
  );

  const openPostJob = () => {
    if (!isVerifiedEmployer) {
      showToast(
        "Confirm your work email from Get Verified to unlock job posting."
      );
      router.push("/dashboard?tab=my_profile");
      return;
    }
    setCompany(companyForNewJob);
    setPostOpen(true);
  };

  const toggleStatus = async (listing: ListingRow) => {
    const nextStatus = listing.status === "Active" ? "paused" : "active";
    const previous = jobs;
    setJobs((current) =>
      current.map((job) =>
        job.id === listing.id ? { ...job, status: nextStatus } : job
      )
    );

    try {
      const response = await fetch(`/api/jobs/${listing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const payload = (await readJsonResponse(response)) as {
        error?: string;
        job?: JobRow;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "Could not update listing status.");
      }
      if (payload.job) {
        setJobs((current) =>
          current.map((job) =>
            job.id === listing.id ? { ...job, ...payload.job } : job
          )
        );
      }
      showToast(
        nextStatus === "paused"
          ? "Listing deactivated. It is hidden from other accounts."
          : "Listing reactivated."
      );
    } catch (error) {
      console.error("Job status update failed:", error);
      setJobs(previous);
      showToast("Could not update listing status. Please try again.");
    }
  };

  const deleteListing = async (listing: ListingRow) => {
    if (deletingId) {
      return;
    }
    const confirmed = window.confirm(
      `Delete "${listing.title}"? This cannot be undone.`
    );
    if (!confirmed) {
      return;
    }

    const previous = jobs;
    setDeletingId(listing.id);
    setJobs((current) => current.filter((job) => job.id !== listing.id));

    try {
      const response = await fetch(`/api/jobs/${listing.id}`, {
        method: "DELETE",
      });
      const payload = (await readJsonResponse(response)) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Could not delete listing.");
      }
      showToast("Listing deleted.");
    } catch (error) {
      console.error("Job delete failed:", error);
      setJobs(previous);
      showToast("Could not delete listing. Please try again.");
    } finally {
      setDeletingId(null);
    }
  };

  const handleCreateJob = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!userId || isCreatingJob) {
      return;
    }
    if (!isVerifiedEmployer) {
      showToast(
        "Confirm your work email from Get Verified before posting jobs."
      );
      return;
    }
    if (!title.trim()) {
      showToast("Job title is required.");
      return;
    }
    if (!company.trim()) {
      showToast("Company name is required.");
      return;
    }

    const isContractJob = engagementType === "contract";
    const normalizedContractHours = isContractJob
      ? normalizeContractHoursPerWeek(contractHours)
      : "";
    const hourlyRate = hourlyRateRange.trim();

    if (isContractJob) {
      if (!normalizedContractHours) {
        showToast("Select a weekly bandwidth for contract sprints.");
        return;
      }
      if (!hourlyRate) {
        showToast("Target hourly rate is required for contract sprints.");
        return;
      }
    } else if (!location.trim()) {
      showToast("Location is required.");
      return;
    } else if (!salaryRange.trim()) {
      showToast("Salary range is required.");
      return;
    }

    const skills = parseJobListInput(requiredSkills);
    const stack = parseJobListInput(techStack);
    if (skills.length === 0) {
      showToast("Add at least one required skill.");
      return;
    }

    setIsCreatingJob(true);
    const supabase = createClient();
    const employmentType = employmentTypeFromJobType(engagementType);
    const dbPayload = {
      title: title.trim(),
      company: company.trim(),
      location: isContractJob ? "Remote" : location.trim(),
      salary_range: isContractJob ? hourlyRate : formatSalaryRange(salaryRange.trim()),
      tags: jobDisplayTags({
        tech_stack: stack,
        required_skills: skills,
      }),
      tech_stack: stack.length > 0 ? stack : null,
      required_skills: skills,
      employer_id: userId,
      employment_type: employmentType,
      contract_hours_per_week: isContractJob ? normalizedContractHours : null,
      hourly_rate_range: isContractJob ? hourlyRate : null,
    };

    try {
      let { data, error } = await supabase
        .from("jobs")
        .insert(dbPayload)
        .select("*")
        .single();

      if (error && isSupabaseSchemaError(error)) {
        const {
          contract_hours_per_week: _hours,
          hourly_rate_range: _rate,
          ...withoutContractFields
        } = dbPayload;
        const retry = await supabase
          .from("jobs")
          .insert(withoutContractFields)
          .select("*")
          .single();
        data = retry.data;
        error = retry.error;
      }

      if (error && isSupabaseSchemaError(error)) {
        const fallback = await supabase
          .from("jobs")
          .insert({
            title: dbPayload.title,
            company: dbPayload.company,
            location: dbPayload.location,
            salary_range: dbPayload.salary_range,
            tags: dbPayload.tags,
            employer_id: dbPayload.employer_id,
          })
          .select("*")
          .single();
        data = fallback.data;
        error = fallback.error;
      }

      if (error || !data) {
        console.error("Create job error:", error);
        showToast("Could not post job. Please try again.");
        return;
      }

      setJobs((current) => [data as JobRow, ...current]);
      setPostOpen(false);
      resetForm();
      showToast("Job posted successfully!");
    } catch (error) {
      console.error("Create job error:", error);
      showToast("Could not post job. Please try again.");
    } finally {
      setIsCreatingJob(false);
    }
  };

  if (rolePending || !isBusinessAccount) {
    return (
      <div className="flex min-h-[240px] items-center justify-center text-sm text-textMuted">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
        Loading job postings
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-widest text-brand">
            Employer Console
          </p>
          <h1 className="text-3xl font-extrabold tracking-tight text-textMain">
            Job Postings
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-textMuted">
            Roles you have published to the Provix opportunities feed. Pause a
            listing to hide it, or open applicants when someone is interested.
          </p>
        </div>
        <button
          type="button"
          onClick={openPostJob}
          className="shrink-0 cursor-pointer rounded-xl bg-brand px-4 py-2.5 text-xs font-bold text-white transition-all hover:bg-brandHover"
        >
          + Post Job
        </button>
      </div>

      {loading ? (
        <div className="flex min-h-[200px] items-center justify-center rounded-2xl border border-border bg-panel text-sm text-textMuted">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
          Loading listings
        </div>
      ) : loadError ? (
        <div className="rounded-2xl border border-border bg-panel p-8 text-center">
          <p className="text-sm text-textMuted">{loadError}</p>
          <button
            type="button"
            onClick={() => void loadListings()}
            className="mt-4 cursor-pointer text-xs font-bold text-brand"
          >
            Try again
          </button>
        </div>
      ) : listings.length === 0 ? (
        <div className="rounded-2xl border border-border bg-panel p-10 text-center">
          <p className="text-sm text-textMuted">
            No listings yet. Post a job to start receiving candidate interest.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-panel">
          <table className="w-full min-w-[640px] text-left">
            <thead>
              <tr className="border-b border-border text-[11px] font-bold uppercase tracking-widest text-textMuted">
                <th className="px-5 py-3 font-bold">Role</th>
                <th className="px-5 py-3 font-bold">Interest</th>
                <th className="px-5 py-3 font-bold">Status</th>
                <th className="px-5 py-3 text-right font-bold">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {listings.map((listing) => (
                <tr key={listing.id} className="border-b border-border last:border-b-0">
                  <td className="px-5 py-4">
                    <span className="block text-sm font-bold text-textMain">
                      {listing.title}
                    </span>
                    <span className="mt-1 block text-[11px] text-textMuted">
                      {[listing.company, listing.location, listing.employmentType]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    {listing.applicants > 0 ? (
                      <Link
                        href={dashboardTabHref("applicants")}
                        className="text-[11px] font-bold text-brand hover:text-brand"
                      >
                        Interested ({listing.applicants})
                      </Link>
                    ) : (
                      <span className="text-[11px] font-bold text-textMuted">
                        Interested (0)
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <button
                      type="button"
                      onClick={() => void toggleStatus(listing)}
                      title="Click to toggle status"
                      className={`cursor-pointer rounded-full border px-2.5 py-1 text-[10px] font-bold transition-all ${
                        listing.status === "Active"
                          ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                          : "border-border bg-background text-textMuted"
                      }`}
                    >
                      {listing.status}
                    </button>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <button
                      type="button"
                      aria-label={`Delete ${listing.title}`}
                      title="Delete listing"
                      onClick={() => void deleteListing(listing)}
                      disabled={deletingId === listing.id}
                      className="cursor-pointer rounded-lg border border-border p-1.5 text-textMuted transition-colors hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-60"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {postOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="card-edge relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-panel p-8">
            <button
              type="button"
              onClick={() => {
                setPostOpen(false);
                resetForm();
              }}
              disabled={isCreatingJob}
              aria-label="Close post job"
              className="absolute right-4 top-4 cursor-pointer text-textMuted transition-colors hover:text-textMain disabled:opacity-50"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
            <p className="mb-2 text-xs font-bold uppercase tracking-widest text-brand">
              Employer Console
            </p>
            <h2 className="text-xl font-extrabold text-textMain">Post New Job</h2>
            <p className="mb-6 mt-2 text-sm text-textMuted">
              Publish a role to the Provix opportunities feed.
            </p>
            <form onSubmit={(event) => void handleCreateJob(event)} className="space-y-4">
              <div>
                <span className="mb-2 block text-[11px] font-bold uppercase text-textMuted">
                  Engagement Type
                </span>
                <div
                  role="radiogroup"
                  aria-label="Engagement type"
                  className="inline-flex w-full rounded-xl border border-border bg-background p-1"
                >
                  {(
                    [
                      ["full_time", "Full-Time"],
                      ["contract", "Contract Sprint"],
                    ] as const
                  ).map(([value, label]) => {
                    const selected = engagementType === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => setEngagementType(value)}
                        className={`flex-1 cursor-pointer rounded-lg px-3 py-2 text-xs font-bold transition-colors ${
                          selected
                            ? "border border-border bg-panel text-textMain shadow-sm"
                            : "text-textMuted hover:text-textMain"
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="mb-2 block text-[11px] font-bold uppercase text-textMuted">
                  Job Title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder={
                    engagementType === "contract"
                      ? "Frontend Contract Sprint"
                      : "Senior Frontend Engineer"
                  }
                  required
                  className="w-full rounded-xl border border-border bg-background p-3 text-sm text-textMain placeholder:text-textMuted focus:border-brand focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-2 block text-[11px] font-bold uppercase text-textMuted">
                  Company Name
                </label>
                <input
                  type="text"
                  value={company}
                  onChange={(event) => setCompany(event.target.value)}
                  placeholder="Your company"
                  required
                  className="w-full rounded-xl border border-border bg-background p-3 text-sm text-textMain placeholder:text-textMuted focus:border-brand focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {engagementType === "contract" ? (
                  <>
                    <div>
                      <label
                        htmlFor="job-weekly-bandwidth"
                        className="mb-2 block text-[11px] font-bold uppercase text-textMuted"
                      >
                        Weekly Bandwidth
                      </label>
                      <select
                        id="job-weekly-bandwidth"
                        value={contractHours}
                        onChange={(event) =>
                          setContractHours(
                            normalizeContractHoursPerWeek(event.target.value)
                          )
                        }
                        required
                        className="w-full rounded-xl border border-border bg-background p-3 text-sm text-textMain focus:border-brand focus:outline-none"
                      >
                        <option value="">Select weekly hours</option>
                        {JOB_CONTRACT_BANDWIDTH_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label
                        htmlFor="job-hourly-rate"
                        className="mb-2 block text-[11px] font-bold uppercase text-textMuted"
                      >
                        Target Hourly Rate
                      </label>
                      <input
                        id="job-hourly-rate"
                        type="text"
                        value={hourlyRateRange}
                        onChange={(event) =>
                          setHourlyRateRange(event.target.value)
                        }
                        placeholder="$80 - $120 / hr"
                        required
                        className="w-full rounded-xl border border-border bg-background p-3 text-sm text-textMain placeholder:text-textMuted focus:border-brand focus:outline-none"
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <label className="mb-2 block text-[11px] font-bold uppercase text-textMuted">
                        Location
                      </label>
                      <input
                        type="text"
                        value={location}
                        onChange={(event) => setLocation(event.target.value)}
                        placeholder="Remote · US"
                        required
                        className="w-full rounded-xl border border-border bg-background p-3 text-sm text-textMain placeholder:text-textMuted focus:border-brand focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-[11px] font-bold uppercase text-textMuted">
                        Salary Range
                      </label>
                      <input
                        type="text"
                        value={salaryRange}
                        onChange={(event) => setSalaryRange(event.target.value)}
                        placeholder="80,000 - 100,000 / yr"
                        required
                        className="w-full rounded-xl border border-border bg-background p-3 text-sm text-textMain placeholder:text-textMuted focus:border-brand focus:outline-none"
                      />
                    </div>
                  </>
                )}
              </div>

              <div>
                <label className="mb-2 block text-[11px] font-bold uppercase text-textMuted">
                  Required Skills
                </label>
                <input
                  type="text"
                  value={requiredSkills}
                  onChange={(event) => setRequiredSkills(event.target.value)}
                  placeholder="Agile, system design, 3+ years backend"
                  required
                  className="w-full rounded-xl border border-border bg-background p-3 text-sm text-textMain placeholder:text-textMuted focus:border-brand focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-2 block text-[11px] font-bold uppercase text-textMuted">
                  Tech Stack
                  <span className="ml-1.5 font-medium normal-case tracking-normal text-textMuted">
                    optional
                  </span>
                </label>
                <input
                  type="text"
                  value={techStack}
                  onChange={(event) => setTechStack(event.target.value)}
                  placeholder="React, TypeScript, Next.js"
                  className="w-full rounded-xl border border-border bg-background p-3 text-sm text-textMain placeholder:text-textMuted focus:border-brand focus:outline-none"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setPostOpen(false);
                    resetForm();
                  }}
                  disabled={isCreatingJob}
                  className="flex-1 cursor-pointer rounded-xl bg-panel py-3 text-xs font-bold text-textMuted transition-all hover:text-textMain disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingJob}
                  className="flex-1 cursor-pointer rounded-xl bg-brand py-3 text-xs font-bold text-white transition-all hover:bg-brandHover disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isCreatingJob ? "Posting..." : "Post Job"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <Toast message={toastMessage} />
    </div>
  );
}
