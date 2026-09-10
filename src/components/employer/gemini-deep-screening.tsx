"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import AuditChecksList from "@/components/auditor/audit-checks-list";
import ProductionScorecard from "@/components/auditor/production-scorecard";
import ScoreCapBreakdown from "@/components/auditor/score-cap-breakdown";
import ScoreMeter from "@/components/ScoreMeter";
import { fetchWithAuth } from "@/lib/fetch-with-auth";
import { formatGpa } from "@/lib/gpa";
import { jobDisplayTags, parseJobListInput } from "@/lib/jobs";
import { clampScore0to100 } from "@/lib/score-scale";
import { isFilesystemCapRedFlag } from "@/lib/repo-filesystem";
import {
  AUDIT_STORAGE_PREFIX,
  coerceDeepScreeningResult,
  DEEP_SCREENING_FETCH_TIMEOUT_MS,
  DEEP_SCREENING_STAGES,
  describeDeepScreeningFailure,
  getCandidateScreeningKey,
  getIntegrityScoreClass,
  isAbortOrTimeoutError,
  parseStoredScreeningResult,
  type DeepScreeningResult,
  type ScreeningJobContext,
  type TalentPoolCandidate,
} from "@/lib/talent-pool-candidate";
import { resolveTalentProfileId } from "@/lib/talent-pool-profiles";
import { createClient } from "@/utils/supabase/client";

type GeminiDeepScreeningProps = {
  candidate: TalentPoolCandidate;
  publicName: string;
  lockedBio: string;
  screeningJob?: ScreeningJobContext | null;
  companyName?: string;
  requireAuth?: () => boolean;
  onToast?: (message: string) => void;
};

export default function GeminiDeepScreening({
  candidate,
  publicName,
  lockedBio,
  screeningJob = null,
  companyName = "your company",
  requireAuth,
  onToast,
}: GeminiDeepScreeningProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DeepScreeningResult | null>(null);
  const [stage, setStage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [showResults, setShowResults] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const runIdRef = useRef(0);
  const resultRef = useRef<DeepScreeningResult | null>(null);

  resultRef.current = result;

  const screeningKey = getCandidateScreeningKey(candidate);

  const clearStageInterval = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const clearTimeoutHandle = () => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  const abortInFlight = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    clearTimeoutHandle();
  };

  useEffect(() => {
    let cancelled = false;
    runIdRef.current += 1;

    const applyCachedResult = () => {
      if (typeof window === "undefined") {
        return false;
      }

      const cached = localStorage.getItem(`${AUDIT_STORAGE_PREFIX}${screeningKey}`);
      if (!cached) {
        return false;
      }

      const parsed = parseStoredScreeningResult(cached);
      if (!parsed) {
        return false;
      }

      if (!cancelled) {
        setResult(parsed);
        setShowResults(true);
      }
      return true;
    };

    setError(null);
    setLoading(false);
    setStage(0);
    clearStageInterval();

    if (!applyCachedResult()) {
      setResult(null);
      setShowResults(false);

      void (async () => {
        try {
          const supabase = createClient();
          const { data, error: loadError } = await supabase
            .from("candidate_screenings")
            .select("audit_data")
            .eq("candidate_key", screeningKey)
            .maybeSingle();

          if (cancelled) {
            return;
          }

          if (!loadError && data?.audit_data) {
            const audit = coerceDeepScreeningResult(
              data.audit_data as DeepScreeningResult
            );
            setResult(audit);
            setShowResults(true);
            if (typeof window !== "undefined") {
              try {
                localStorage.setItem(
                  `${AUDIT_STORAGE_PREFIX}${screeningKey}`,
                  JSON.stringify(audit)
                );
              } catch (storageError) {
                console.warn("Could not cache screening result:", storageError);
              }
            }
            return;
          }

          applyCachedResult();
        } catch (err) {
          console.error("Failed to load persisted screening:", err);
          if (!cancelled) {
            applyCachedResult();
          }
        }
      })();
    }

    return () => {
      cancelled = true;
      runIdRef.current += 1;
      clearStageInterval();
      abortInFlight();
    };
  }, [screeningKey]);

  const handleCopyInterviewQuestion = async (question: string) => {
    try {
      await navigator.clipboard.writeText(question);
      onToast?.("Interview question copied.");
    } catch {
      onToast?.("Could not copy question.");
    }
  };

  const runDeepScreening = async () => {
    if (requireAuth && !requireAuth()) {
      return;
    }

    const job = screeningJob ?? {
      title: candidate.role || "General Talent Evaluation",
      company: companyName,
      tags: candidate.skills.slice(0, 8),
      tech_stack: [],
      required_skills: candidate.skills.slice(0, 8),
      location: "",
    };

    const runId = ++runIdRef.current;
    abortInFlight();
    clearStageInterval();

    setLoading(true);
    setError(null);
    setShowResults(false);
    setStage(0);

    intervalRef.current = setInterval(() => {
      setStage((prev) => (prev < DEEP_SCREENING_STAGES.length - 1 ? prev + 1 : prev));
    }, 1400);

    const controller = new AbortController();
    abortRef.current = controller;
    timeoutRef.current = window.setTimeout(() => {
      controller.abort();
    }, DEEP_SCREENING_FETCH_TIMEOUT_MS);

    const isCurrentRun = () => runId === runIdRef.current;

    try {
      let response: Response;
      try {
        response = await fetchWithAuth("/api/screen", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            candidate: {
              name: publicName,
              title: candidate.role,
              bio: lockedBio,
              skills: candidate.skills,
              degree: candidate.major,
              university: candidate.university,
              major: candidate.major,
              gpa: formatGpa(candidate.gpa),
              graduation_year: candidate.graduationYear,
              experience: candidate.experienceLevel,
              projects: candidate.projects,
              github_url: candidate.github_url ?? candidate.github ?? "",
              github: candidate.github ?? "",
            },
            job: {
              title: job.title,
              company: job.company ?? companyName,
              tags: jobDisplayTags(job),
              tech_stack: parseJobListInput(job.tech_stack),
              required_skills: parseJobListInput(job.required_skills),
              location: job.location ?? "",
            },
            candidate_key: screeningKey,
            profile_id:
              resolveTalentProfileId(candidate) || candidate.profileId || undefined,
          }),
        });
      } catch (networkError) {
        throw networkError;
      }

      if (!isCurrentRun()) {
        return;
      }

      let payload: (DeepScreeningResult & { error?: string }) | null = null;
      try {
        payload = (await response.json()) as DeepScreeningResult & {
          error?: string;
        };
      } catch (parseError) {
        throw new Error(
          response.ok
            ? "The live audit returned an unreadable response. Please retry."
            : describeDeepScreeningFailure(parseError, response.status)
        );
      }

      if (!response.ok) {
        throw new Error(
          payload?.error?.trim() ||
            describeDeepScreeningFailure(null, response.status)
        );
      }

      let data: DeepScreeningResult;
      try {
        if (!payload || typeof payload.integrity_score !== "number") {
          throw new Error("incomplete screening payload");
        }
        data = coerceDeepScreeningResult(payload);
      } catch {
        throw new Error(
          "The live audit returned an incomplete result. Please retry."
        );
      }
      setStage(DEEP_SCREENING_STAGES.length - 1);
      await new Promise((resolve) => window.setTimeout(resolve, 450));
      if (!isCurrentRun()) {
        return;
      }

      setResult(data);
      setShowResults(true);
      setError(null);
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem(
            `${AUDIT_STORAGE_PREFIX}${screeningKey}`,
            JSON.stringify(data)
          );
        } catch (storageError) {
          console.warn("Could not cache screening result:", storageError);
        }
      }
    } catch (err) {
      if (!isCurrentRun()) {
        return;
      }

      console.error("Deep screening request failed:", err);
      const previousResult = resultRef.current;
      setError(describeDeepScreeningFailure(err));
      setShowResults(Boolean(previousResult));
      onToast?.(
        isAbortOrTimeoutError(err)
          ? "Live audit timed out. Use retry to run the GitHub sequence again."
          : "Deep screening dropped. Use retry to run the audit again."
      );
    } finally {
      if (isCurrentRun()) {
        clearTimeoutHandle();
        clearStageInterval();
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
        setLoading(false);
      }
    }
  };

  return (
    <div className="bg-background border border-border rounded-xl p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase font-bold text-textMuted tracking-wider mb-1">
            Gemini Deep Screening
          </div>
          <p className="text-xs text-textMuted leading-relaxed">
            Run live GitHub artifact audits and integrity scoring for this candidate.
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => void runDeepScreening()}
        disabled={loading}
        className="w-full bg-brand hover:bg-brandHover disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg text-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
      >
        {loading ? (
          <>
            <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Running live audit…
          </>
        ) : showResults ? (
          "Re-run Live Audit"
        ) : (
          "Generate AI Deep Screening"
        )}
      </button>

      {loading && (
        <div className="space-y-2.5 pt-1">
          {DEEP_SCREENING_STAGES.map((stageLabel, index) => {
            const isComplete = index < stage;
            const isActive = index === stage;

            return (
              <div
                key={stageLabel}
                className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 transition-all duration-300 ${
 isComplete
 ? "border-emerald-500/25 bg-emerald-500/5"
 : isActive
 ? "border-brand/30 bg-brandGlow"
 : "border-border bg-background"
 }`}
              >
                <span
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold ${
 isComplete
 ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-400"
 : isActive
 ? "border-brand/40 bg-brandGlow text-brand"
 : "border-border text-textMuted"
 }`}
                >
                  {isComplete ? (
                    <Check className="h-3 w-3" aria-hidden />
                  ) : isActive ? (
                    <span className="h-2 w-2 rounded-full bg-brand animate-pulse" />
                  ) : (
                    index + 1
                  )}
                </span>
                <p
                  className={`text-xs leading-relaxed ${
 isComplete
 ? "text-emerald-200"
 : isActive
 ? "text-indigo-100"
 : "text-textMuted"
 }`}
                >
                  {stageLabel}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {error && !loading && (
        <div className="rounded-xl border border-red-500/25 bg-red-500/5 p-4 space-y-3">
          <p className="text-xs text-red-200 leading-relaxed">{error}</p>
          <button
            type="button"
            onClick={() => void runDeepScreening()}
            disabled={loading}
            className="w-full bg-red-500/10 hover:bg-red-500/15 border border-red-500/25 text-red-200 font-semibold py-2 rounded-lg text-xs transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
          >
            Retry Live Audit
          </button>
        </div>
      )}

      {showResults && result && !loading && (
        <div className="space-y-4 pt-1">
          <div
            className={`rounded-xl border p-4 text-center ${getIntegrityScoreClass(result.integrity_score)}`}
          >
            <div className="text-[10px] uppercase font-bold tracking-widest mb-1">
              Integrity Score
            </div>
            <div className="text-4xl font-mono font-extrabold tabular-nums">
              {clampScore0to100(result.integrity_score)}
              <span className="text-lg font-semibold opacity-70">/100</span>
            </div>
            <ScoreMeter
              score={result.integrity_score}
              className="mt-3 mx-auto max-w-[160px]"
            />
            {result.github_audit && (
              <p className="text-[11px] mt-2 opacity-80 font-mono">
                Live audit: {result.github_audit.owner}/{result.github_audit.repo}
                {result.github_audit.language
                  ? ` · ${result.github_audit.language}`
                  : ""}
              </p>
            )}
          </div>

          <ScoreCapBreakdown
            scoreCap={result.scoreCap}
            score={result.integrity_score}
            filesystem={result.github_audit?.filesystem}
          />

          <ProductionScorecard metrics={result.metrics} compact />

          {result.timeline_flags.filter(
            (flag) => !result.scoreCap?.applied || !isFilesystemCapRedFlag(flag)
          ).length > 0 && (
            <div>
              <div className="text-[10px] uppercase font-bold text-red-400 tracking-wider mb-2">
                Timeline & Repository Flags
              </div>
              <ul className="space-y-1.5">
                {result.timeline_flags
                  .filter(
                    (flag) =>
                      !result.scoreCap?.applied || !isFilesystemCapRedFlag(flag)
                  )
                  .map((flag, index) => (
                  <li
                    key={`flag-${index}`}
                    className="text-xs text-red-200 leading-relaxed bg-red-500/5 border border-red-500/20 rounded-lg px-3 py-2"
                  >
                    {flag}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <AuditChecksList checks={result.checks} />

          <div>
            <div className="text-[10px] uppercase font-bold text-purple-300 tracking-wider mb-2">
              Employer Interview Cheat Sheet
            </div>
            <div className="space-y-3">
              {(result.interview_questions ?? []).map((item, index) => (
                <div
                  key={`interview-question-${index}`}
                  className="bg-background border border-border rounded-xl p-3.5 space-y-2.5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="inline-flex px-2 py-1 rounded-md text-[10px] font-bold bg-brandGlow text-brand border border-brand/20 shrink-0">
                      {item.category}
                    </span>
                    <button
                      type="button"
                      onClick={() => void handleCopyInterviewQuestion(item.question)}
                      className="inline-flex items-center gap-1 text-[10px] font-bold text-textMuted hover:text-textMain transition-colors cursor-pointer shrink-0"
                    >
                      <Copy className="w-3 h-3" aria-hidden />
                      Copy Question
                    </button>
                  </div>
                  <p className="text-xs text-textMain font-medium leading-relaxed">
                    {item.question}
                  </p>
                  <div className="pt-2 border-t border-border">
                    <p className="text-[10px] uppercase font-bold text-textMuted tracking-wider mb-1">
                      What to listen for
                    </p>
                    <p className="text-[11px] text-textMuted leading-relaxed">
                      {item.what_to_listen_for}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider mb-2">
              Technical Depth Summary
            </div>
            <p className="text-xs text-textMuted leading-relaxed bg-emerald-500/5 border border-emerald-500/10 rounded-lg px-3 py-2">
              {result.technical_depth_summary}
            </p>
          </div>

          {result.github_audit?.fetch_warnings &&
            result.github_audit.fetch_warnings.length > 0 && (
              <div>
                <div className="text-[10px] uppercase font-bold text-amber-400 tracking-wider mb-2">
                  GitHub Fetch Warnings
                </div>
                <ul className="space-y-1.5">
                  {result.github_audit.fetch_warnings.map((warning, index) => (
                    <li
                      key={`gh-warning-${index}`}
                      className="text-xs text-amber-200 leading-relaxed bg-amber-500/5 border border-amber-500/15 rounded-lg px-3 py-2"
                    >
                      {warning}
                    </li>
                  ))}
                </ul>
              </div>
            )}
        </div>
      )}
    </div>
  );
}
