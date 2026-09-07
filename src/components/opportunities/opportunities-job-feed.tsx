"use client";

import { useMemo, useState } from "react";
import { Check, LoaderCircle, Search, Sparkles } from "lucide-react";
import { formatSalaryRange } from "@/lib/format-salary-range";
import { jobDisplayTags, type JobRow } from "@/lib/jobs";
import {
  countActiveOpenings,
  countJobsMatchingCandidateSkills,
  getActiveJobs,
} from "@/lib/opportunities-metrics";
import {
  getFitVerdictBadgeClass,
  type OpportunityMatchResult,
} from "@/lib/opportunity-match";
import { clampScore0to100 } from "@/lib/score-scale";
import ScoreMeter from "@/components/ScoreMeter";

export type OpportunitiesJobFeedProps = {
  jobs: JobRow[];
  jobsLoading: boolean;
  jobsError?: string | null;
  isGuest: boolean;
  appliedJobIds: string[];
  onExpressInterest: (job: JobRow) => void;
  matchInsights?: Record<string, OpportunityMatchResult>;
  matchLoadingIds?: Record<string, boolean>;
  candidateSkills?: string[];
  profileVisibleToEmployers?: boolean;
  loadingProfile?: boolean;
  enableAiMatch?: boolean;
  aiMatchRunning?: boolean;
  aiMatchError?: string | null;
  onRunAiMatch?: () => void;
};

export default function OpportunitiesJobFeed({
  jobs,
  jobsLoading,
  jobsError = null,
  isGuest,
  appliedJobIds,
  onExpressInterest,
  matchInsights = {},
  matchLoadingIds = {},
  candidateSkills = [],
  profileVisibleToEmployers = false,
  loadingProfile = false,
  enableAiMatch = false,
  aiMatchRunning = false,
  aiMatchError = null,
  onRunAiMatch,
}: OpportunitiesJobFeedProps) {
  const [search, setSearch] = useState("");
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);

  const activeJobs = useMemo(() => getActiveJobs(jobs), [jobs]);
  const activeOpeningsCount = useMemo(
    () => countActiveOpenings(jobs),
    [jobs]
  );
  const skillMatchingJobsCount = useMemo(
    () => countJobsMatchingCandidateSkills(jobs, candidateSkills),
    [jobs, candidateSkills]
  );

  const hasAiMatchResults = Object.keys(matchInsights).length > 0;
  const canRunAiMatch =
    enableAiMatch &&
    !jobsLoading &&
    activeJobs.length > 0 &&
    !aiMatchRunning &&
    (isGuest || !loadingProfile);

  const filteredJobFeed = useMemo(() => {
    const query = search.trim().toLowerCase();

    const filtered = activeJobs.filter((job) => {
      const tags = jobDisplayTags(job);
      const matchesSearch =
        !query ||
        (job.title ?? "").toLowerCase().includes(query) ||
        (job.company ?? "").toLowerCase().includes(query) ||
        tags.some((tag) => tag.toLowerCase().includes(query));
      const matchesRemote =
        !remoteOnly || (job.location ?? "").toLowerCase().includes("remote");

      return matchesSearch && matchesRemote;
    });

    if (!hasAiMatchResults) {
      return filtered;
    }

    return [...filtered].sort((left, right) => {
      const leftScore = clampScore0to100(
        matchInsights[left.id]?.match_score ?? 0
      );
      const rightScore = clampScore0to100(
        matchInsights[right.id]?.match_score ?? 0
      );
      return rightScore - leftScore;
    });
  }, [activeJobs, hasAiMatchResults, matchInsights, remoteOnly, search]);

  return (
    <div>
      <div className="mb-8 rounded-2xl border border-zinc-800 bg-gradient-to-br from-[#141414] via-[#111111] to-[#0A0A0A] p-6 sm:p-8">
        <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white leading-snug">
          Hire developers based on what they&apos;ve actually built, not what
          they claim.
        </h2>
        <p className="text-zinc-300 text-sm sm:text-base mt-3 leading-relaxed max-w-3xl">
          Provix audits candidates&apos; real GitHub work and proof-of-work
          signals — so employers hire with confidence, and candidates get credit
          for what they&apos;ve genuinely done.
        </p>
      </div>

      <div className="mb-8">
        <p className="text-xs font-bold uppercase tracking-widest text-indigo-300 mb-2">
          Job Feed
        </p>
        <h1 className="text-3xl font-extrabold tracking-tight text-white">
          Opportunities
        </h1>
        <p className="text-zinc-300 text-sm mt-2 leading-relaxed">
          {isGuest
            ? "Browse openings, companies, and requirements. Sign in when you are ready to express interest."
            : "Curated openings matched to your profile — express interest in one click."}
        </p>
        {enableAiMatch ? (
          <div className="mt-5">
            <button
              type="button"
              onClick={() => onRunAiMatch?.()}
              disabled={!canRunAiMatch}
              className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:hover:bg-indigo-600 disabled:cursor-not-allowed text-white text-xs font-bold tracking-tight px-4 py-2.5 rounded-md transition-colors duration-200 ease-out cursor-pointer"
            >
              {aiMatchRunning ? (
                <LoaderCircle
                  className="h-3.5 w-3.5 animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {aiMatchRunning
                ? `Matching ${activeJobs.length} roles…`
                : hasAiMatchResults
                  ? "Re-run Provix AI Match"
                  : "Run Provix AI Match"}
            </button>
            {aiMatchRunning ? (
              <p className="text-xs text-zinc-400 mt-2 leading-relaxed">
                Scoring your audited skills against active listings. This can
                take a few seconds.
              </p>
            ) : null}
            {aiMatchError ? (
              <p className="text-xs text-rose-400 mt-2">{aiMatchError}</p>
            ) : null}
          </div>
        ) : null}
      </div>

      <div
        className={`grid grid-cols-1 gap-4 mb-8 ${
          isGuest ? "sm:grid-cols-2" : "sm:grid-cols-3"
        }`}
      >
        <div className="card-edge bg-[#111111] p-5 rounded-2xl border border-zinc-800 shadow-lg">
          <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest block mb-1">
            Active Openings
          </span>
          <span className="text-3xl font-extrabold text-white">
            {jobsLoading ? "—" : activeOpeningsCount}
          </span>
        </div>
        {isGuest ? (
          <div className="card-edge bg-[#111111] p-5 rounded-2xl border border-zinc-800 shadow-lg">
            <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest block mb-1">
              Apply
            </span>
            <span className="text-sm font-extrabold text-indigo-400">
              Sign in to get matched
            </span>
          </div>
        ) : (
          <>
            <div className="card-edge bg-[#111111] p-5 rounded-2xl border border-zinc-800 shadow-lg">
              <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest block mb-1">
                Matching Your Skills
              </span>
              <span className="text-3xl font-extrabold text-indigo-400">
                {jobsLoading ? "—" : skillMatchingJobsCount}
              </span>
            </div>
            <div className="card-edge bg-[#111111] p-5 rounded-2xl border border-zinc-800 shadow-lg">
              <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest block mb-1">
                Profile Visibility
              </span>
              <span
                className={`text-sm font-extrabold ${
                  profileVisibleToEmployers
                    ? "text-emerald-400"
                    : "text-zinc-300"
                }`}
              >
                {loadingProfile
                  ? "—"
                  : profileVisibleToEmployers
                    ? "Active 🟢"
                    : "Hidden"}
              </span>
            </div>
          </>
        )}
      </div>

      <div className="card-edge bg-[#111111] border border-zinc-800 rounded-2xl p-4 mb-6 shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="relative flex-1">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500">
              <Search className="w-4 h-4" aria-hidden="true" />
            </span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search roles, companies, or skills..."
              className="w-full bg-[#0A0A0A] border border-zinc-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-all"
            />
          </div>
          <button
            type="button"
            onClick={() => setRemoteOnly((prev) => !prev)}
            className={`shrink-0 text-[11px] font-bold px-4 py-2.5 rounded-xl border transition-colors duration-200 ease-out cursor-pointer ${
              remoteOnly
                ? "bg-indigo-600 border-indigo-500 text-white"
                : "bg-[#0A0A0A] border-zinc-800 text-zinc-300 hover:text-white hover:border-zinc-500"
            }`}
          >
            Remote Only
          </button>
        </div>
      </div>

      {jobsLoading ? (
        <div className="card-edge bg-[#111111] border border-zinc-800 rounded-2xl p-10 text-center">
          <p className="text-sm font-medium text-zinc-300">
            Loading opportunities...
          </p>
        </div>
      ) : jobsError ? (
        <div className="card-edge bg-[#111111] border border-zinc-800 rounded-2xl p-10 text-center">
          <p className="text-sm font-medium text-zinc-100">
            Could not load job feed
          </p>
          <p className="text-xs text-zinc-400 mt-1">
            The opportunities list is unavailable right now. You can keep
            using the rest of the dashboard.
          </p>
        </div>
      ) : activeJobs.length === 0 ? (
        <div className="card-edge bg-[#111111] border border-zinc-800 rounded-2xl p-10 text-center">
          <p className="text-sm font-medium text-zinc-100">
            No active openings right now
          </p>
          <p className="text-xs text-zinc-400 mt-1">
            New roles are posted as employers join Provix. Sign in to be first in
            line.
          </p>
        </div>
      ) : filteredJobFeed.length === 0 ? (
        <div className="card-edge bg-[#111111] border border-zinc-800 rounded-2xl p-10 text-center">
          <p className="text-sm font-medium text-zinc-100">
            No jobs match your filters
          </p>
          <p className="text-xs text-zinc-400 mt-1">
            Try clearing search or disabling Remote Only.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredJobFeed.map((job) => {
            const alreadyApplied = appliedJobIds.includes(job.id);
            const tags = jobDisplayTags(job);
            const insight = matchInsights[job.id];
            const isMatching = Boolean(matchLoadingIds[job.id]);
            const matchScore = insight?.match_score ?? 0;
            const formattedSalary = formatSalaryRange(job.salary_range);
            const isExpanded = expandedJobId === job.id;
            const jobDescription = (job.description ?? "").trim();

            return (
              <div
                key={job.id}
                className="card-edge card-lift bg-[#111111] border border-zinc-800 rounded-2xl p-5 shadow-lg flex flex-col"
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    <h3 className="font-bold text-white text-base truncate">
                      {job.title}
                    </h3>
                    <p className="text-sm text-indigo-300 font-semibold mt-0.5 truncate">
                      {job.company}
                    </p>
                  </div>
                  {enableAiMatch ? (
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <span
                        className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold border ${
                          isMatching
                            ? "bg-indigo-500/10 text-indigo-300 border-indigo-500/30 animate-pulse"
                            : insight
                              ? getFitVerdictBadgeClass(insight.fit_verdict)
                              : "bg-zinc-800 text-zinc-300 border-zinc-700"
                        }`}
                      >
                        {isMatching
                          ? "Scoring…"
                          : insight
                            ? insight.fit_verdict
                            : "Pending"}
                      </span>
                      {insight && !isMatching ? (
                        <>
                          <span className="text-[10px] font-mono font-bold tabular-nums text-zinc-400">
                            {clampScore0to100(matchScore)}% match
                          </span>
                          <ScoreMeter score={matchScore} className="w-16" />
                        </>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                {formattedSalary ? (
                  <p className="text-sm font-semibold text-emerald-400 mb-1">
                    {formattedSalary}
                  </p>
                ) : null}
                <p className="text-xs text-zinc-300 mb-4">{job.location}</p>

                {tags.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-2 py-1 rounded-md text-[10px] font-bold border bg-indigo-500/10 text-indigo-200 border-indigo-500/30"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}

                {jobDescription ? (
                  <div className="mb-4">
                    <p
                      className={`text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap ${
                        isExpanded ? "" : "line-clamp-3"
                      }`}
                    >
                      {jobDescription}
                    </p>
                    {jobDescription.length > 160 && (
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedJobId((prev) =>
                            prev === job.id ? null : job.id
                          )
                        }
                        className="mt-2 text-[11px] font-bold text-indigo-300 hover:text-indigo-200 transition-colors duration-200 ease-out cursor-pointer"
                      >
                        {isExpanded ? "Show less" : "Read full opening"}
                      </button>
                    )}
                  </div>
                ) : null}

                {enableAiMatch && (isMatching || insight) && (
                  <div className="mb-4 rounded-xl bg-[#0A0A0A] border border-zinc-800 p-3">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-2">
                      AI Match Analysis
                    </span>
                    {isMatching ? (
                      <div className="flex items-center gap-2">
                        <span className="relative flex h-2 w-2">
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500" />
                        </span>
                        <p className="text-xs text-zinc-400">
                          Evaluating your profile against this role with Gemini…
                        </p>
                      </div>
                    ) : (
                      <ul className="space-y-1.5">
                        {insight?.match_reasons.map((reason, index) => (
                          <li
                            key={`${job.id}-reason-${index}`}
                            className="flex items-start gap-2 text-xs text-zinc-200 leading-relaxed"
                          >
                            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-indigo-400" />
                            <span>{reason}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                <div className="mt-auto flex items-center justify-end pt-4 border-t border-zinc-800">
                  <button
                    type="button"
                    onClick={() => onExpressInterest(job)}
                    disabled={alreadyApplied}
                    className={`text-[11px] font-bold tracking-tight px-4 py-2 rounded-md transition-colors duration-200 ease-out flex items-center gap-1.5 ${
                      alreadyApplied
                        ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 cursor-not-allowed"
                        : "bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer"
                    }`}
                  >
                    {alreadyApplied ? (
                      <>
                        Interest Sent
                        <Check className="w-3.5 h-3.5" aria-hidden="true" />
                      </>
                    ) : (
                      "Express Interest"
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
