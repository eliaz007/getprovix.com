"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import ScoreMeter from "@/components/ScoreMeter";
import VerifiedOnProvixPill from "@/components/VerifiedOnProvixPill";
import { fetchWithAuth } from "@/lib/fetch-with-auth";
import {
  applicantStatusClass,
  applicantStatusLabel,
  getFitVerdictBadgeClass,
  type EmployerApplicantView,
  type EmployerApplicantsPayload,
} from "@/lib/job-applicants";
import { hasTalentEducation } from "@/lib/talent-pool-profiles";
import { subscribeIncomingJobInterest } from "@/lib/job-interest";
import { createClient } from "@/utils/supabase/client";

type EmployerApplicantsSectionProps = {
  userId: string | null;
  focusJobId?: string | null;
  onClearFocusJob?: () => void;
  onRequestIntro: (applicant: EmployerApplicantView) => void;
};

export default function EmployerApplicantsSection({
  userId,
  focusJobId = null,
  onClearFocusJob,
  onRequestIntro,
}: EmployerApplicantsSectionProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [applicants, setApplicants] = useState<EmployerApplicantView[]>([]);
  const [jobs, setJobs] = useState<EmployerApplicantsPayload["jobs"]>([]);
  const [jobFilter, setJobFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

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
      const payload = (await response.json().catch(() => null)) as
        | (EmployerApplicantsPayload & { error?: string })
        | null;

      if (!response.ok || !payload || payload.error) {
        throw new Error(payload?.error ?? "Could not load interested candidates.");
      }

      setApplicants(payload.applicants ?? []);
      setJobs(payload.jobs ?? []);
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

  return (
    <div>
      <div className="mb-8">
        <p className="text-xs font-bold uppercase tracking-widest text-indigo-400 mb-2">
          Hiring Pipeline
        </p>
        <h1 className="text-3xl font-extrabold tracking-tight text-white">
          Interested Candidates
        </h1>
        <p className="text-zinc-300 text-sm mt-2 max-w-2xl">
          Candidates who expressed interest in your listings. Review anonymized
          profiles, AI match analysis, and request an intro when you want to talk.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <div className="card-edge bg-[#111111] p-5 rounded-2xl border border-zinc-800">
          <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest block mb-1">
            Total interest
          </span>
          <span className="text-3xl font-mono font-extrabold tabular-nums text-white">
            {applicants.length}
          </span>
        </div>
        <div className="card-edge bg-[#111111] p-5 rounded-2xl border border-zinc-800">
          <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest block mb-1">
            New to review
          </span>
          <span className="text-3xl font-mono font-extrabold tabular-nums text-amber-300">
            {newCount}
          </span>
        </div>
        <div className="card-edge bg-[#111111] p-5 rounded-2xl border border-zinc-800 col-span-2 lg:col-span-1">
          <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest block mb-1">
            Roles with interest
          </span>
          <span className="text-3xl font-mono font-extrabold tabular-nums text-indigo-300">
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
          className="flex-1 bg-[#111111] border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
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
          className="sm:w-52 bg-[#111111] border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
        >
          <option value="all">All statuses</option>
          <option value="new">New interest</option>
          <option value="intro_requested">Intro requested</option>
          <option value="unlocked">Contact unlocked</option>
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-3 py-20 text-sm text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
          Loading interested candidates...
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/5 px-4 py-4 text-sm text-red-300">
          {error}
        </div>
      ) : visibleApplicants.length === 0 ? (
        <div className="rounded-2xl border border-zinc-800 bg-[#111111] px-6 py-14 text-center">
          <p className="text-sm text-slate-300 font-medium">
            {applicants.length === 0
              ? "No candidates have expressed interest yet."
              : "No candidates match these filters."}
          </p>
          <p className="text-xs text-slate-500 mt-2">
            {applicants.length === 0
              ? "When someone taps Express Interest on one of your listings, they will appear here."
              : "Try another listing or status to keep reviewing your pipeline."}
          </p>
        </div>
      ) : (
        <ul className="space-y-4">
          {visibleApplicants.map((applicant) => (
            <li
              key={applicant.applicationId}
              className="card-edge rounded-2xl border border-zinc-800 bg-[#111111] p-5"
            >
              <div className="flex flex-col lg:flex-row lg:items-start gap-5">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div className="w-11 h-11 rounded-full bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-xs font-bold text-indigo-300 shrink-0">
                    {applicant.initials}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-bold text-white text-sm truncate">
                        {applicant.codenameAlias}
                      </h2>
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border ${applicantStatusClass(applicant.status)}`}
                      >
                        {applicantStatusLabel(applicant.status)}
                      </span>
                      {applicant.verifiedOnProvix ? <VerifiedOnProvixPill /> : null}
                    </div>
                    <p className="text-xs text-indigo-300 font-medium mt-0.5 truncate">
                      {applicant.headline}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-1">
                      {applicant.location}
                      {applicant.experienceLevel
                        ? ` · ${applicant.experienceLevel}`
                        : ""}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-2">
                      Interested in{" "}
                      <span className="text-slate-200 font-medium">
                        {applicant.jobTitle}
                      </span>
                      <span className="text-slate-600"> · {applicant.jobStatus}</span>
                      <span className="text-slate-600">
                        {" "}
                        · {applicant.appliedAtLabel}
                      </span>
                    </p>
                  </div>
                </div>

                <div className="shrink-0 rounded-xl border border-zinc-800 bg-[#0A0A0A] px-4 py-3 lg:w-52">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                      AI Match
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold border ${getFitVerdictBadgeClass(applicant.fitVerdict)}`}
                    >
                      {applicant.fitVerdict}
                    </span>
                  </div>
                  <p className="font-mono text-lg font-extrabold tabular-nums text-white">
                    {applicant.matchScore}%
                  </p>
                  <ScoreMeter score={applicant.matchScore} className="mt-2" />
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-2">
                    Education
                  </span>
                  <div className="rounded-xl border border-zinc-800 bg-[#0A0A0A] p-3.5 text-xs text-slate-200 space-y-2">
                    {applicant.university ? (
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-slate-500 shrink-0">University</span>
                        <span className="text-right">{applicant.university}</span>
                      </div>
                    ) : null}
                    {applicant.major ? (
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-slate-500 shrink-0">Major</span>
                        <span className="text-right">{applicant.major}</span>
                      </div>
                    ) : null}
                    {applicant.gpa ? (
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-slate-500 shrink-0">GPA</span>
                        <span className="text-right font-mono">{applicant.gpa}</span>
                      </div>
                    ) : null}
                    {!hasTalentEducation(applicant) ? (
                      <p className="text-slate-500">Education details not provided.</p>
                    ) : null}
                  </div>
                </div>

                <div>
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-2">
                    AI Match Analysis
                  </span>
                  <div className="rounded-xl border border-zinc-800 bg-[#0A0A0A] p-3.5 text-xs text-slate-200 space-y-2">
                    {applicant.matchReasoning ? (
                      <p className="text-slate-300 leading-relaxed">
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
                            className="px-2 py-1 rounded-md text-[10px] font-bold bg-slate-800/80 text-slate-300 border border-slate-700/50"
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
                      className="block text-xs text-slate-200 hover:text-white break-all"
                    >
                      {applicant.email}
                    </a>
                  ) : (
                    <p className="text-xs text-slate-400">No email on file.</p>
                  )}
                  {applicant.phone ? (
                    <p className="text-xs text-slate-200">{applicant.phone}</p>
                  ) : null}
                </div>
              ) : null}

              <div className="mt-4 flex items-center justify-end">
                {applicant.unlocked ? (
                  <span className="text-[11px] font-bold text-emerald-300">
                    Unlocked
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onRequestIntro(applicant)}
                    className="text-[11px] font-bold px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-all cursor-pointer"
                  >
                    Request Intro
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
