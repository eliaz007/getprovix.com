"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import CandidateIntelligenceDrawer from "@/components/employer/candidate-intelligence-drawer";
import ProductionScoreBadge from "@/components/employer/production-score-badge";
import ScoreMeter from "@/components/ScoreMeter";
import VerifiedOnProvixPill from "@/components/VerifiedOnProvixPill";
import { fetchWithAuth } from "@/lib/fetch-with-auth";
import { readJsonResponse } from "@/lib/read-json-response";
import {
  APPLICANT_PIPELINE_STATUSES,
  applicantStatusClass,
  applicantStatusLabel,
  getFitVerdictBadgeClass,
  mapApplicantToTalentCandidate,
  type EmployerApplicantView,
  type EmployerApplicantsPayload,
} from "@/lib/job-applicants";
import CandidateEducationSummary from "@/components/CandidateEducationSummary";
import { subscribeIncomingJobInterest } from "@/lib/job-interest";
import { createClient } from "@/utils/supabase/client";

type EmployerApplicantsSectionProps = {
  userId: string | null;
  focusJobId?: string | null;
  onClearFocusJob?: () => void;
  onRequestIntro: (applicant: EmployerApplicantView) => void;
  requireAuth?: () => boolean;
  onToast?: (message: string) => void;
  companyName?: string;
};

export default function EmployerApplicantsSection({
  userId,
  focusJobId = null,
  onClearFocusJob,
  onRequestIntro,
  requireAuth,
  onToast,
  companyName,
}: EmployerApplicantsSectionProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [applicants, setApplicants] = useState<EmployerApplicantView[]>([]);
  const [jobs, setJobs] = useState<EmployerApplicantsPayload["jobs"]>([]);
  const [jobFilter, setJobFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [selectedApplicant, setSelectedApplicant] =
    useState<EmployerApplicantView | null>(null);

  const loadApplicants = useCallback(async () => {
    if (!userId) {
      setApplicants([]);
      setJobs([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetchWithAuth("/api/employer/applicants");
      const payload = (await readJsonResponse(response).catch(() => null)) as
        | (EmployerApplicantsPayload & { error?: string })
        | null;

      if (!response.ok || !payload || payload.error) {
        throw new Error(payload?.error ?? "Could not load interested candidates.");
      }

      setApplicants(payload.applicants ?? []);
      setJobs(payload.jobs ?? []);
      setActionError(null);
    } catch (loadError) {
      console.error("Failed to load employer applicants:", loadError);
      setError("Could not load interested candidates. Please try again.");
      setApplicants([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void loadApplicants();
  }, [loadApplicants]);

  useEffect(() => {
    if (!userId) {
      return;
    }

    const supabase = createClient();
    return subscribeIncomingJobInterest(supabase, userId, () => {
      void loadApplicants();
    });
  }, [userId, loadApplicants]);

  const rejectApplicant = useCallback(async (applicant: EmployerApplicantView) => {
    if (applicant.status === "rejected" || rejectingId) {
      return;
    }

    setRejectingId(applicant.applicationId);
    setActionError(null);

    try {
      const response = await fetchWithAuth("/api/employer/applicants", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicationId: applicant.applicationId,
          status: "rejected",
        }),
      });
      const payload = (await readJsonResponse(response).catch(() => null)) as {
        ok?: boolean;
        error?: string;
      } | null;

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error ?? "Could not reject this candidate.");
      }

      setApplicants((current) =>
        current.map((row) =>
          row.applicationId === applicant.applicationId
            ? { ...row, status: "rejected" }
            : row
        )
      );
    } catch (rejectError) {
      console.error("Failed to reject applicant:", rejectError);
      setActionError("Could not reject this candidate. Please try again.");
    } finally {
      setRejectingId(null);
    }
  }, [rejectingId]);

  useEffect(() => {
    if (focusJobId) {
      setJobFilter(focusJobId);
    }
  }, [focusJobId]);

  const visibleApplicants = useMemo(() => {
    return applicants.filter((applicant) => {
      const matchesJob =
        jobFilter === "all" || applicant.jobId === jobFilter;
      const matchesStatus =
        statusFilter === "all" || applicant.status === statusFilter;
      return matchesJob && matchesStatus;
    });
  }, [applicants, jobFilter, statusFilter]);

  const newCount = applicants.filter((row) => row.status === "new").length;

  const selectedTalentCandidate = selectedApplicant
    ? mapApplicantToTalentCandidate(selectedApplicant)
    : null;

  const openApplicantIntelligence = (applicant: EmployerApplicantView) => {
    setSelectedApplicant(applicant);
  };

  useEffect(() => {
    if (!selectedApplicant) {
      return;
    }

    const latest = applicants.find(
      (row) => row.applicationId === selectedApplicant.applicationId
    );
    if (!latest) {
      setSelectedApplicant(null);
      return;
    }
    if (latest !== selectedApplicant) {
      setSelectedApplicant(latest);
    }
  }, [applicants, selectedApplicant]);

  return (
    <div>
      <div className="mb-8">
        <p className="text-xs font-bold uppercase tracking-widest text-brand mb-2">
          Hiring Pipeline
        </p>
        <h1 className="text-3xl font-extrabold tracking-tight text-textMain">
          Interested Candidates
        </h1>
        <p className="text-textMuted text-sm mt-2 max-w-2xl">
          Candidates who expressed interest in your listings. Open a profile to
          review AI match analysis, run Gemini Deep Screening, and request an
          intro when you want to talk.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <div className="card-edge bg-panel p-5 rounded-2xl border border-border">
          <span className="text-[11px] font-bold text-textMuted uppercase tracking-widest block mb-1">
            Total interest
          </span>
          <span className="text-3xl font-mono font-extrabold tabular-nums text-textMain">
            {applicants.length}
          </span>
        </div>
        <div className="card-edge bg-panel p-5 rounded-2xl border border-border">
          <span className="text-[11px] font-bold text-textMuted uppercase tracking-widest block mb-1">
            New to review
          </span>
          <span className="text-3xl font-mono font-extrabold tabular-nums text-amber-300">
            {newCount}
          </span>
        </div>
        <div className="card-edge bg-panel p-5 rounded-2xl border border-border col-span-2 lg:col-span-1">
          <span className="text-[11px] font-bold text-textMuted uppercase tracking-widest block mb-1">
            Roles with interest
          </span>
          <span className="text-3xl font-mono font-extrabold tabular-nums text-brand">
            {new Set(applicants.map((row) => row.jobId)).size}
          </span>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <label className="sr-only" htmlFor="applicant-job-filter">
          Filter by job
        </label>
        <select
          id="applicant-job-filter"
          value={jobFilter}
          onChange={(event) => {
            setJobFilter(event.target.value);
            if (focusJobId && event.target.value !== focusJobId) {
              onClearFocusJob?.();
            }
          }}
          className="flex-1 bg-panel border border-border rounded-xl px-3 py-2.5 text-sm text-textMain focus:outline-none focus:border-brand"
        >
          <option value="all">All listings</option>
          {jobs.map((job) => (
            <option key={job.id} value={job.id}>
              {job.title}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="applicant-status-filter">
          Filter by status
        </label>
        <select
          id="applicant-status-filter"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          className="sm:w-52 bg-panel border border-border rounded-xl px-3 py-2.5 text-sm text-textMain focus:outline-none focus:border-brand"
        >
          <option value="all">All statuses</option>
          {APPLICANT_PIPELINE_STATUSES.map((status) => (
            <option key={status.value} value={status.value}>
              {status.label}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-3 py-20 text-sm text-textMuted">
          <Loader2 className="w-5 h-5 animate-spin text-brand" />
          Loading interested candidates...
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/5 px-4 py-4 text-sm text-red-300">
          {error}
        </div>
      ) : visibleApplicants.length === 0 ? (
        <div className="rounded-2xl border border-border bg-panel px-6 py-14 text-center">
          <p className="text-sm text-textMuted font-medium">
            {applicants.length === 0
              ? "No candidates have expressed interest yet."
              : "No candidates match these filters."}
          </p>
          <p className="text-xs text-textMuted mt-2">
            {applicants.length === 0
              ? "When someone taps Express Interest on one of your listings, they will appear here."
              : "Try another listing or status to keep reviewing your pipeline."}
          </p>
        </div>
      ) : (
        <>
          {actionError ? (
            <div className="mb-4 rounded-xl border border-rose-500/20 bg-rose-500/5 px-4 py-3 text-sm text-rose-300">
              {actionError}
            </div>
          ) : null}
          <ul className="space-y-4">
          {visibleApplicants.map((applicant) => (
            <li key={applicant.applicationId}>
              <div
                role="button"
                tabIndex={0}
                onClick={() => openApplicantIntelligence(applicant)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openApplicantIntelligence(applicant);
                  }
                }}
                className="card-edge rounded-2xl border border-border bg-panel p-5 cursor-pointer hover:border-brand/40 transition-colors"
              >
              <div className="flex flex-col lg:flex-row lg:items-start gap-5">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div className="w-11 h-11 rounded-full bg-brand/20 border border-brand/30 flex items-center justify-center text-xs font-bold text-brand shrink-0">
                    {applicant.initials}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 min-w-0">
                      <h2 className="font-bold text-textMain text-sm truncate">
                        {applicant.codenameAlias}
                      </h2>
                      <ProductionScoreBadge
                        score={applicant.productionScore}
                        verified={Boolean(applicant.isAuditVerified)}
                      />
                      <span
                        className={`inline-flex shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold border ${applicantStatusClass(applicant.status)}`}
                      >
                        {applicantStatusLabel(applicant.status)}
                      </span>
                      <VerifiedOnProvixPill
                        verified={applicant.verifiedOnProvix}
                      />
                    </div>
                    <p className="text-xs text-brand font-medium mt-0.5 truncate">
                      {applicant.headline}
                    </p>
                    <p className="text-[11px] text-textMuted mt-1">
                      {applicant.location}
                      {applicant.experienceLevel
                        ? ` · ${applicant.experienceLevel}`
                        : ""}
                    </p>
                    <p className="text-[11px] text-textMuted mt-2">
                      Interested in{" "}
                      <span className="text-textMain font-medium">
                        {applicant.jobTitle}
                      </span>
                      <span className="text-textMuted">
                        {" "}
                        · {applicant.appliedAtLabel}
                      </span>
                    </p>
                  </div>
                </div>

                <div className="shrink-0 rounded-xl border border-border bg-background px-4 py-3 lg:w-52">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-textMuted">
                      AI Match
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold border ${getFitVerdictBadgeClass(applicant.fitVerdict)}`}
                    >
                      {applicant.fitVerdict}
                    </span>
                  </div>
                  <p className="font-mono text-lg font-extrabold tabular-nums text-textMain">
                    {applicant.matchScore}%
                  </p>
                  <ScoreMeter score={applicant.matchScore} className="mt-2" />
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <span className="text-[10px] font-bold text-textMuted uppercase tracking-widest block mb-2">
                    Education
                  </span>
                  <div className="rounded-xl border border-border bg-background p-3.5 text-xs text-textMain space-y-2">
                    <CandidateEducationSummary
                      isSelfTaught={applicant.isSelfTaught}
                      university={applicant.university}
                      major={applicant.major}
                      gpa={applicant.gpa}
                      graduationYear={applicant.graduationYear}
                    />
                  </div>
                </div>

                <div>
                  <span className="text-[10px] font-bold text-textMuted uppercase tracking-widest block mb-2">
                    AI Match Analysis
                  </span>
                  <div className="rounded-xl border border-border bg-background p-3.5 text-xs text-textMain space-y-2">
                    {applicant.matchReasoning ? (
                      <p className="text-textMuted leading-relaxed">
                        {applicant.matchReasoning}
                      </p>
                    ) : null}
                    {applicant.matchingSkills.length > 0 ? (
                      <p>
                        <span className="text-emerald-400/90 font-medium">Overlap: </span>
                        {applicant.matchingSkills.join(", ")}
                      </p>
                    ) : null}
                    {applicant.missingSkills.length > 0 ? (
                      <p>
                        <span className="text-amber-300/90 font-medium">Gaps: </span>
                        {applicant.missingSkills.join(", ")}
                      </p>
                    ) : null}
                    {applicant.skills.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {applicant.skills.slice(0, 6).map((skill) => (
                          <span
                            key={skill}
                            className="px-2 py-1 rounded-md text-[10px] font-bold bg-panel/80 text-textMuted border border-border/50"
                          >
                            {skill}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              {applicant.unlocked ? (
                <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-1.5">
                  <span className="text-[10px] font-bold text-emerald-300 uppercase tracking-widest block">
                    Contact Information
                  </span>
                  {applicant.email ? (
                    <a
                      href={`mailto:${applicant.email}`}
                      onClick={(event) => event.stopPropagation()}
                      className="block text-xs text-textMain hover:text-textMain break-all"
                    >
                      {applicant.email}
                    </a>
                  ) : (
                    <p className="text-xs text-textMuted">No email on file.</p>
                  )}
                  {applicant.phone ? (
                    <p className="text-xs text-textMain">{applicant.phone}</p>
                  ) : null}
                </div>
              ) : null}

              <div className="mt-4 flex items-center justify-end gap-2">
                {applicant.status === "rejected" ? (
                  <span className="text-[11px] font-bold text-rose-300">
                    Rejected
                  </span>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onRequestIntro(applicant);
                      }}
                      className="text-[11px] font-bold px-3.5 py-2 rounded-lg bg-brand hover:bg-brandHover text-white transition-all cursor-pointer"
                    >
                      Request Intro
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        void rejectApplicant(applicant);
                      }}
                      disabled={rejectingId === applicant.applicationId}
                      className="text-[11px] font-bold px-3.5 py-2 rounded-lg border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-200 transition-all cursor-pointer disabled:opacity-60 disabled:cursor-wait"
                    >
                      {rejectingId === applicant.applicationId ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          Rejecting
                        </span>
                      ) : (
                        "Reject"
                      )}
                    </button>
                  </>
                )}
              </div>
              </div>
            </li>
          ))}
          </ul>
        </>
      )}

      <CandidateIntelligenceDrawer
        candidate={selectedTalentCandidate}
        open={selectedApplicant !== null}
        isUnlocked={Boolean(selectedApplicant?.unlocked)}
        onClose={() => setSelectedApplicant(null)}
        onRequestIntro={() => {
          if (selectedApplicant) {
            onRequestIntro(selectedApplicant);
          }
        }}
        screeningJob={
          selectedApplicant
            ? {
                title: selectedApplicant.jobTitle,
                tags: selectedApplicant.skills.slice(0, 8),
                required_skills: [
                  ...selectedApplicant.matchingSkills,
                  ...selectedApplicant.missingSkills,
                ].slice(0, 8),
                tech_stack: selectedApplicant.matchingSkills,
              }
            : null
        }
        companyName={companyName}
        requireAuth={requireAuth}
        onToast={onToast}
      />
    </div>
  );
}
