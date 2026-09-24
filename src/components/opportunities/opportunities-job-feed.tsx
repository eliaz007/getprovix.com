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
    <div className="text-zinc-100">
      <div className="mb-8">
        <p className="font-mono text-xs font-medium uppercase tracking-widest text-zinc-500">
          Talent Network
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-white">
          Provix Talent Network
        </h1>
        <p className="mt-1 text-sm text-zinc-400">
          {isGuest
            ? "Browse openings, companies, and requirements. Sign in when you are ready to express interest."
            : "Open roles matched to your verified stack. Connect directly with hiring teams."}
        </p>
        {enableAiMatch ? (
          <div className="mt-5">
            <button
              type="button"
              onClick={() => onRunAiMatch?.()}
              disabled={!canRunAiMatch}
              className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
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
              <p className="mt-2 text-xs leading-relaxed text-zinc-400">
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
        <div className="rounded-xl border border-white/[0.08] bg-zinc-900/50 p-5 shadow-xl backdrop-blur-md">
          <span className="mb-2 block font-mono text-[11px] uppercase tracking-wider text-zinc-400">
            Active Openings
          </span>
          <span
            className={`font-mono text-2xl font-bold ${
              !jobsLoading && activeOpeningsCount > 0
                ? "text-violet-400"
                : "text-zinc-100"
            }`}
          >
            {jobsLoading ? "—" : activeOpeningsCount}
          </span>
          {!jobsLoading && activeOpeningsCount === 0 ? (
            <p className="mt-2 text-xs leading-relaxed text-zinc-400">
              New roles are added regularly. Keep your profile updated to match
              with hiring founders.
            </p>
          ) : null}
        </div>
        {isGuest ? (
          <div className="rounded-xl border border-white/[0.08] bg-zinc-900/50 p-5 shadow-xl backdrop-blur-md">
            <span className="mb-2 block font-mono text-[11px] uppercase tracking-wider text-zinc-400">
              Apply
            </span>
            <span className="font-mono text-sm font-bold text-violet-300">
              Sign in to get matched
            </span>
          </div>
        ) : (
          <>
            <div className="rounded-xl border border-white/[0.08] bg-zinc-900/50 p-5 shadow-xl backdrop-blur-md">
              <span className="mb-2 block font-mono text-[11px] uppercase tracking-wider text-zinc-400">
                Matching Your Skills
              </span>
              <span
                className={`font-mono text-2xl font-bold ${
                  !jobsLoading && skillMatchingJobsCount > 0
                    ? "text-violet-400"
                    : "text-zinc-100"
                }`}
              >
                {jobsLoading ? "—" : skillMatchingJobsCount}
              </span>
            </div>
            <div className="rounded-xl border border-white/[0.08] bg-zinc-900/50 p-5 shadow-xl backdrop-blur-md">
              <span className="mb-2 block font-mono text-[11px] uppercase tracking-wider text-zinc-400">
                Profile Visibility
              </span>
              <span
                className={`font-mono text-sm font-bold ${
                  profileVisibleToEmployers ? "text-emerald-400" : "text-zinc-400"
                }`}
              >
                {loadingProfile
                  ? "—"
                  : profileVisibleToEmployers
                    ? "Active"
                    : "Hidden"}
              </span>
            </div>
          </>
        )}
      </div>

      <div className="mb-6 rounded-xl border border-white/[0.08] bg-zinc-900/50 p-4 shadow-xl backdrop-blur-md">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500">
              <Search className="h-4 w-4" aria-hidden="true" />
            </span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search roles, companies, or skills..."
              className="w-full rounded-lg border border-white/[0.09] bg-[#070709] py-2.5 pl-10 pr-4 font-mono text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-violet-500/60 focus:outline-none focus:ring-1 focus:ring-violet-500/20"
            />
          </div>
          <button
            type="button"
            onClick={() => setRemoteOnly((prev) => !prev)}
            className={`shrink-0 cursor-pointer rounded-md border px-4 py-2.5 font-mono text-[11px] transition-colors duration-200 ease-out ${
              remoteOnly
                ? "border-violet-500/30 bg-violet-500/10 text-violet-300"
                : "border-white/[0.08] bg-[#070709] text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Remote Only
          </button>
        </div>
      </div>

      {jobsLoading ? (
        <div className="rounded-xl border border-white/[0.08] bg-[#131316]/90 p-10 text-center shadow-xl backdrop-blur-md">
          <p className="text-sm font-medium text-zinc-400">
            Loading opportunities...
          </p>
        </div>
      ) : jobsError ? (
        <div className="rounded-xl border border-white/[0.08] bg-[#131316]/90 p-10 text-center shadow-xl backdrop-blur-md">
          <p className="text-sm font-medium text-zinc-100">
            Could not load job feed
          </p>
          <p className="mt-1 text-xs text-zinc-400">
            The opportunities list is unavailable right now. You can keep
            using the rest of the dashboard.
          </p>
        </div>
      ) : activeJobs.length === 0 ? (
        <div className="rounded-xl border border-white/[0.08] bg-[#131316]/90 p-10 text-center shadow-xl backdrop-blur-md">
          <p className="text-sm font-medium text-zinc-100">
            No active openings right now
          </p>
        </div>
      ) : filteredJobFeed.length === 0 ? (
        <div className="rounded-xl border border-white/[0.08] bg-[#131316]/90 p-10 text-center shadow-xl backdrop-blur-md">
          <p className="text-sm font-medium text-zinc-100">
            No jobs match your filters
          </p>
          <p className="mt-1 text-xs text-zinc-400">
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
                className="flex flex-col rounded-xl border border-white/[0.08] bg-[#131316]/90 p-5 shadow-2xl transition-all hover:border-violet-500/30"
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold text-zinc-100">
                      {job.title}
                    </h3>
                    <p className="mt-0.5 truncate text-sm font-medium text-violet-300">
                      {job.company}
                    </p>
                  </div>
                  {enableAiMatch ? (
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <span
                        className={
                          isMatching
                            ? "inline-flex items-center rounded-md border border-violet-500/25 bg-violet-500/10 px-2.5 py-1 font-mono text-xs font-medium text-violet-300 animate-pulse"
                            : insight
                              ? getFitVerdictBadgeClass(insight.fit_verdict)
                              : "inline-flex items-center rounded-md border border-white/[0.08] bg-[#1A1A1E] px-2.5 py-1 font-mono text-xs font-medium text-zinc-400"
                        }
                      >
                        {isMatching
                          ? "Scoring…"
                          : insight
                            ? insight.fit_verdict
                            : "Pending"}
                      </span>
                      {insight && !isMatching ? (
                        <>
                          <span className="font-mono text-[10px] font-bold tabular-nums text-zinc-500">
                            {clampScore0to100(matchScore)}% match
                          </span>
                          <ScoreMeter score={matchScore} className="w-16" />
                        </>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                {formattedSalary ? (
                  <p className="mb-1 font-mono text-sm font-semibold text-violet-300">
                    {formattedSalary}
                  </p>
                ) : null}
                <p className="mb-4 font-mono text-xs text-zinc-500">{job.location}</p>

                {tags.length > 0 ? (
                  <div className="mb-4 flex flex-wrap gap-1.5">
                    {tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded border border-violet-500/20 bg-violet-500/10 px-1.5 py-0.5 font-mono text-[10px] text-violet-300"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}

                {jobDescription ? (
                  <div className="mb-4">
                    <p
                      className={`whitespace-pre-wrap text-xs leading-relaxed text-zinc-400 ${
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
                        className="mt-2 cursor-pointer font-mono text-[11px] font-medium text-violet-300 transition-colors duration-200 ease-out hover:text-violet-200"
                      >
                        {isExpanded ? "Show less" : "Read full opening"}
                      </button>
                    )}
                  </div>
                ) : null}

                {enableAiMatch && (isMatching || insight) && (
                  <div className="mb-4 rounded-lg border border-white/[0.06] bg-[#070709] p-3 font-mono text-xs text-zinc-300">
                    <span className="mb-2 block font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                      AI Match Analysis
                    </span>
                    {isMatching ? (
                      <div className="flex items-center gap-2">
                        <span className="relative flex h-2 w-2">
                          <span className="relative inline-flex h-2 w-2 rounded-full bg-violet-400" />
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
                            className="flex items-start gap-2 text-xs leading-relaxed text-zinc-300"
                          >
                            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-violet-400" />
                            <span>{reason}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                <div className="mt-3 flex items-center justify-between border-t border-white/[0.06] pt-3 text-xs text-zinc-400">
                  <button
                    type="button"
                    onClick={() => onExpressInterest(job)}
                    disabled={alreadyApplied}
                    className={`ml-auto flex items-center gap-1.5 rounded-md px-4 py-2 font-mono text-[11px] font-medium tracking-tight transition-colors duration-200 ease-out ${
                      alreadyApplied
                        ? "cursor-not-allowed border border-white/[0.08] bg-zinc-900/50 text-zinc-400"
                        : "cursor-pointer bg-violet-600 text-white shadow-sm hover:bg-violet-500"
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
