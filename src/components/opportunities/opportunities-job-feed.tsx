"use client";

import { useMemo, useState } from "react";
import { Check, Search } from "lucide-react";
import { formatSalaryRange } from "@/lib/format-salary-range";
import type { JobRow } from "@/lib/jobs";
import {
  countActiveOpenings,
  countJobsMatchingCandidateSkills,
  getActiveJobs,
} from "@/lib/opportunities-metrics";
import {
  getFitVerdictBadgeClass,
  type OpportunityMatchResult,
} from "@/lib/opportunity-match";

export type OpportunitiesJobFeedProps = {
  jobs: JobRow[];
  jobsLoading: boolean;
  isGuest: boolean;
  appliedJobIds: string[];
  onExpressInterest: (job: JobRow) => void;
  matchInsights?: Record<string, OpportunityMatchResult>;
  matchLoadingIds?: Record<string, boolean>;
  candidateSkills?: string[];
  profileVisibleToEmployers?: boolean;
  loadingProfile?: boolean;
};

export default function OpportunitiesJobFeed({
  jobs,
  jobsLoading,
  isGuest,
  appliedJobIds,
  onExpressInterest,
  matchInsights = {},
  matchLoadingIds = {},
  candidateSkills = [],
  profileVisibleToEmployers = false,
  loadingProfile = false,
}: OpportunitiesJobFeedProps) {
  const [search, setSearch] = useState("");
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
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

  const opportunityTagOptions = useMemo(
    () =>
      Array.from(
        new Set(
          activeJobs.flatMap((job) => (Array.isArray(job.tags) ? job.tags : []))
        )
      ).filter((tag) => tag.trim().length > 0),
    [activeJobs]
  );

  const filteredJobFeed = useMemo(() => {
    const query = search.trim().toLowerCase();

    return activeJobs.filter((job) => {
      const tags = Array.isArray(job.tags) ? job.tags : [];
      const matchesSearch =
        !query ||
        (job.title ?? "").toLowerCase().includes(query) ||
        (job.company ?? "").toLowerCase().includes(query) ||
        tags.some((tag) => tag.toLowerCase().includes(query));
      const matchesRemote =
        !remoteOnly || (job.location ?? "").toLowerCase().includes("remote");
      const matchesTag = !selectedTag || tags.includes(selectedTag);

      return matchesSearch && matchesRemote && matchesTag;
    });
  }, [activeJobs, remoteOnly, search, selectedTag]);

  return (
    <div>
      <div className="mb-8">
        <p className="text-xs font-bold uppercase tracking-widest text-indigo-400 mb-2">
          Job Feed
        </p>
        <h1 className="text-3xl font-extrabold tracking-tight text-white">
          Opportunities
        </h1>
        <p className="text-slate-400 text-sm mt-2">
          {isGuest
            ? "Browse openings, companies, and requirements. Sign in when you are ready to express interest."
            : "Curated openings matched to your profile — express interest in one click."}
        </p>
      </div>

      <div
        className={`grid grid-cols-1 gap-4 mb-8 ${
          isGuest ? "sm:grid-cols-2" : "sm:grid-cols-3"
        }`}
      >
        <div className="card-edge bg-[#111111] p-5 rounded-2xl border border-zinc-800 shadow-lg">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest block mb-1">
            Active Openings
          </span>
          <span className="text-3xl font-extrabold text-white">
            {jobsLoading ? "—" : activeOpeningsCount}
          </span>
        </div>
        {isGuest ? (
          <div className="card-edge bg-[#111111] p-5 rounded-2xl border border-zinc-800 shadow-lg">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest block mb-1">
              Apply
            </span>
            <span className="text-sm font-extrabold text-indigo-400">
              Sign in to express interest
            </span>
          </div>
        ) : (
          <>
            <div className="card-edge bg-[#111111] p-5 rounded-2xl border border-zinc-800 shadow-lg">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest block mb-1">
                Matching Your Skills
              </span>
              <span className="text-3xl font-extrabold text-indigo-400">
                {jobsLoading ? "—" : skillMatchingJobsCount}
              </span>
            </div>
            <div className="card-edge bg-[#111111] p-5 rounded-2xl border border-zinc-800 shadow-lg">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest block mb-1">
                Profile Visibility
              </span>
              <span
                className={`text-sm font-extrabold ${
                  profileVisibleToEmployers
                    ? "text-emerald-400"
                    : "text-slate-400"
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
            className={`shrink-0 text-[11px] font-bold px-4 py-2.5 rounded-xl border transition-all cursor-pointer ${
              remoteOnly
                ? "bg-indigo-600 border-indigo-500 text-white"
                : "bg-[#0A0A0A] border-zinc-800 text-slate-400 hover:text-slate-200 hover:border-slate-700"
            }`}
          >
            Remote Only
          </button>
        </div>
        {opportunityTagOptions.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {opportunityTagOptions.map((tag) => {
              const isSelected = selectedTag === tag;
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() =>
                    setSelectedTag((prev) => (prev === tag ? null : tag))
                  }
                  className={`px-2.5 py-1 rounded-md text-[10px] font-bold border transition-all cursor-pointer ${
                    isSelected
                      ? "bg-indigo-600 border-indigo-500 text-white"
                      : "bg-[#0A0A0A] border-zinc-800 text-slate-400 hover:text-slate-200 hover:border-slate-700"
                  }`}
                >
                  {tag}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {jobsLoading ? (
        <div className="card-edge bg-[#111111] border border-zinc-800 rounded-2xl p-10 text-center">
          <p className="text-sm font-medium text-slate-400">
            Loading opportunities...
          </p>
        </div>
      ) : activeJobs.length === 0 ? (
        <div className="card-edge bg-[#111111] border border-zinc-800 rounded-2xl p-10 text-center">
          <p className="text-sm font-medium text-slate-300">
            No active openings right now
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Check back soon — new roles are posted as employers join Provix.
          </p>
        </div>
      ) : filteredJobFeed.length === 0 ? (
        <div className="card-edge bg-[#111111] border border-zinc-800 rounded-2xl p-10 text-center">
          <p className="text-sm font-medium text-slate-300">
            No jobs match your filters
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Try clearing search or disabling Remote Only.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredJobFeed.map((job) => {
            const alreadyApplied = appliedJobIds.includes(job.id);
            const tags = Array.isArray(job.tags) ? job.tags : [];
            const insight = matchInsights[job.id];
            const isMatching = Boolean(matchLoadingIds[job.id]);
            const matchScore = insight?.match_score ?? 0;
            const formattedSalary = formatSalaryRange(job.salary_range);
            const isExpanded = expandedJobId === job.id;
            const jobDescription = (job.description ?? "").trim();

            return (
              <div
                key={job.id}
                className="card-edge bg-[#111111] border border-zinc-800 rounded-2xl p-5 shadow-lg hover:border-slate-700 transition-all flex flex-col"
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    <h3 className="font-bold text-white text-base truncate">
                      {job.title}
                    </h3>
                    <p className="text-sm text-indigo-400 font-medium mt-0.5 truncate">
                      {job.company}
                    </p>
                  </div>
                  {!isGuest ? (
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <span
                        className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold border ${
                          isMatching
                            ? "bg-indigo-500/10 text-indigo-300 border-indigo-500/30 animate-pulse"
                            : insight
                              ? getFitVerdictBadgeClass(insight.fit_verdict)
                              : "bg-slate-800/80 text-slate-500 border-slate-700/50"
                        }`}
                      >
                        {isMatching
                          ? "Scoring…"
                          : insight
                            ? insight.fit_verdict
                            : "Pending"}
                      </span>
                      {insight && !isMatching ? (
                        <span className="text-[10px] font-mono font-bold tabular-nums text-zinc-400">
                          {matchScore}% match
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                {formattedSalary ? (
                  <p className="text-sm font-semibold text-emerald-400 mb-1">
                    {formattedSalary}
                  </p>
                ) : null}
                <p className="text-xs text-slate-500 mb-4">{job.location}</p>

                <div className="flex flex-wrap gap-1.5 mb-4">
                  {tags.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() =>
                        setSelectedTag((prev) => (prev === tag ? null : tag))
                      }
                      className={`px-2 py-1 rounded-md text-[10px] font-bold border cursor-pointer ${
                        selectedTag === tag
                          ? "bg-indigo-600 text-white border-indigo-500"
                          : "bg-indigo-500/10 text-indigo-300 border-indigo-500/20 hover:border-indigo-400/40"
                      }`}
                    >
                      {tag}
                    </button>
                  ))}
                </div>

                {jobDescription ? (
                  <div className="mb-4">
                    <p
                      className={`text-xs text-slate-400 leading-relaxed whitespace-pre-wrap ${
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
                        className="mt-2 text-[11px] font-bold text-indigo-400 hover:text-indigo-300 cursor-pointer"
                      >
                        {isExpanded ? "Show less" : "Read full opening"}
                      </button>
                    )}
                  </div>
                ) : null}

                {!isGuest && (isMatching || insight) && (
                  <div className="mb-4 rounded-xl bg-[#0A0A0A] border border-zinc-800 p-3">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-2">
                      AI Match Analysis
                    </span>
                    {isMatching ? (
                      <div className="flex items-center gap-2">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-60" />
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500" />
                        </span>
                        <p className="text-xs text-slate-500">
                          Evaluating your profile against this role with Gemini…
                        </p>
                      </div>
                    ) : (
                      <ul className="space-y-1.5 animate-in fade-in duration-300">
                        {insight?.match_reasons.map((reason, index) => (
                          <li
                            key={`${job.id}-reason-${index}`}
                            className="flex items-start gap-2 text-xs text-slate-300 leading-relaxed"
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
                    className={`text-[11px] font-bold px-4 py-2 rounded-lg transition-all flex items-center gap-1.5 ${
                      alreadyApplied
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 cursor-not-allowed"
                        : "bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer"
                    }`}
                  >
                    {alreadyApplied ? (
                      <>
                        Interest Submitted
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
