"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import AuditChecksList from "@/components/auditor/audit-checks-list";
import ProductionScorecard from "@/components/auditor/production-scorecard";
import ScoreCapBreakdown from "@/components/auditor/score-cap-breakdown";
import ScoreMeter from "@/components/ScoreMeter";
import { fetchWithAuth } from "@/lib/fetch-with-auth";
import { readJsonResponse } from "@/lib/read-json-response";
import { formatGpa } from "@/lib/gpa";
import { jobDisplayTags, parseJobListInput } from "@/lib/jobs";
import { clampScore0to100 } from "@/lib/score-scale";
import { isFilesystemCapRedFlag } from "@/lib/repo-filesystem";
import {
  AUDIT_STORAGE_PREFIX,
  coerceDeepScreeningResult,
  DEEP_SCREENING_STAGES,
  getCandidateScreeningKey,
  getIntegrityScoreClass,
  isScreeningAcceptedResponse,
  parseStoredScreeningResult,
  readScreeningQueueState,
  SCREENING_BACKGROUND_WAIT_MS,
  DEEP_SCREENING_FETCH_TIMEOUT_MS,
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

function cacheScreeningResult(
  screeningKey: string,
  result: DeepScreeningResult
) {
  if (typeof window === "undefined") {
    return;
  }

  const key = `${AUDIT_STORAGE_PREFIX}${screeningKey}`;
  const serialized = JSON.stringify(result);

  try {
    localStorage.setItem(key, serialized);
  } catch (storageError) {
    console.warn("Could not cache screening result:", storageError);
  }

  try {
    sessionStorage.setItem(key, serialized);
  } catch {
    // sessionStorage can be blocked in some browser modes; localStorage is enough.
  }
}

function readCachedScreening(screeningKey: string): DeepScreeningResult | null {
  if (typeof window === "undefined") {
    return null;
  }

  const key = `${AUDIT_STORAGE_PREFIX}${screeningKey}`;

  for (const store of [localStorage, sessionStorage]) {
    try {
      const cached = store.getItem(key);
      const parsed = cached ? parseStoredScreeningResult(cached) : null;
      if (parsed) {
        return parsed;
      }
    } catch {
      // Ignore storage access errors and try the next store.
    }
  }

  return null;
}

const LIVE_AUDIT_FAILURE_MESSAGE =
  "Audit timed out or failed. Click retry to run again.";
const INCOMPLETE_LIVE_GITHUB_AUDIT =
  "The live GitHub audit could not be completed";
const SILENT_AUDIT_RETRIES = 2;
const SILENT_AUDIT_RETRY_DELAY_MS = 1600;

function isIncompleteLiveGithubAudit(value: unknown): boolean {
  if (typeof value === "string") {
    return value.includes(INCOMPLETE_LIVE_GITHUB_AUDIT);
  }
  if (value instanceof Error) {
    return value.message.includes(INCOMPLETE_LIVE_GITHUB_AUDIT);
  }
  return false;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showResults, setShowResults] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const runIdRef = useRef(0);
  const resultRef = useRef<DeepScreeningResult | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  resultRef.current = result;

  const screeningKey = getCandidateScreeningKey(candidate);

  const clearStageInterval = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const clearPoll = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const stopWatching = () => {
    clearPoll();
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
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
    const runId = ++runIdRef.current;

    setErrorMessage(null);
    setLoading(false);
    setStage(0);
    clearStageInterval();
    stopWatching();

    const applyCachedResult = () => {
      const parsed = readCachedScreening(screeningKey);
      if (!parsed || cancelled) {
        return false;
      }

      setResult(parsed);
      setShowResults(true);
      return true;
    };

    void (async () => {
      try {
        const supabase = createClient();
        const { data, error: loadError } = await supabase
          .from("candidate_screenings")
          .select("id, audit_data, integrity_score")
          .eq("candidate_key", screeningKey)
          .maybeSingle();

        if (cancelled || runId !== runIdRef.current) {
          return;
        }

        if (loadError || !data) {
          if (!applyCachedResult()) {
            setResult(null);
            setShowResults(false);
          }
          return;
        }

        const view = readScreeningQueueState(data);
        if (view.phase === "completed") {
          cacheScreeningResult(screeningKey, view.result);
          setResult(view.result);
          setShowResults(true);
          setErrorMessage(null);
          return;
        }

        if (view.phase === "pending" || view.phase === "processing") {
          if (data.id) {
            setLoading(true);
            setShowResults(false);
            setStage(view.phase === "processing" ? 1 : 0);
            void watchQueuedScreening(data.id, runId);
          }
          return;
        }

        if (view.phase === "failed") {
          applyCachedResult();
          setErrorMessage(LIVE_AUDIT_FAILURE_MESSAGE);
          return;
        }

        if (!applyCachedResult()) {
          setResult(null);
          setShowResults(false);
        }
      } catch (err) {
        console.error("Failed to load persisted screening:", err);
        if (!cancelled) {
          applyCachedResult();
        }
      }
    })();

    return () => {
      cancelled = true;
      runIdRef.current += 1;
      clearStageInterval();
      stopWatching();
      abortInFlight();
    };
    // watchQueuedScreening is recreated each render; the effect only rebinds on screeningKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screeningKey]);

  const cacheAndShowResult = (data: DeepScreeningResult) => {
    setStage(DEEP_SCREENING_STAGES.length - 1);
    setResult(data);
    setShowResults(true);
    setErrorMessage(null);
    setLoading(false);
    cacheScreeningResult(screeningKey, data);
  };

  const showLiveAuditFailure = (runId?: number) => {
    if (runId != null && runId !== runIdRef.current) {
      return;
    }

    clearStageInterval();
    setErrorMessage(LIVE_AUDIT_FAILURE_MESSAGE);
    setShowResults(Boolean(resultRef.current));
    setLoading(false);
  };

  const watchQueuedScreening = async (screeningId: string, runId: number) => {
    stopWatching();
    const supabase = createClient();
    const isCurrentRun = () => runId === runIdRef.current;
    let settled = false;

    const finish = (view: ReturnType<typeof readScreeningQueueState>) => {
      if (!isCurrentRun() || settled) {
        return;
      }

      if (view.phase === "processing") {
        setStage((prev) => Math.max(prev, 1));
        return;
      }

      if (view.phase === "pending") {
        return;
      }

      settled = true;
      stopWatching();
      clearStageInterval();

      if (view.phase === "completed") {
        applyQueuedResult(view.result);
        return;
      }

      if (view.phase === "failed") {
        showLiveAuditFailure(runId);
      }
    };

    const applyQueuedResult = (data: DeepScreeningResult) => {
      if (!isCurrentRun()) {
        return;
      }
      cacheAndShowResult(data);
    };

    const poll = async () => {
      const { data, error } = await supabase
        .from("candidate_screenings")
        .select("id, audit_data, integrity_score")
        .eq("id", screeningId)
        .maybeSingle();

      if (!isCurrentRun() || error || !data) {
        return;
      }

      finish(readScreeningQueueState(data));
    };

    const channel = supabase
      .channel(`screening-${screeningId}-${runId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "candidate_screenings",
          filter: `id=eq.${screeningId}`,
        },
        (payload) => {
          finish(readScreeningQueueState(payload.new));
        }
      )
      .subscribe();

    unsubscribeRef.current = () => {
      void supabase.removeChannel(channel);
    };

    void poll();
    pollRef.current = setInterval(() => {
      void poll();
    }, 2500);

    window.setTimeout(() => {
      if (!isCurrentRun() || settled) {
        return;
      }

      setErrorMessage(
        "The audit is still running in the background. Keep this panel open — the result will appear when it finishes."
      );
    }, SCREENING_BACKGROUND_WAIT_MS);
  };

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
    stopWatching();

    setLoading(true);
    setErrorMessage(null);
    setShowResults(false);
    setStage(0);

    intervalRef.current = setInterval(() => {
      setStage((prev) => (prev < DEEP_SCREENING_STAGES.length - 1 ? prev + 1 : prev));
    }, 1400);

    const isCurrentRun = () => runId === runIdRef.current;
    const requestBody = JSON.stringify({
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
    });

    const startAttemptTimeout = () => {
      abortInFlight();
      const controller = new AbortController();
      abortRef.current = controller;
      timeoutRef.current = window.setTimeout(() => {
        controller.abort();
      }, DEEP_SCREENING_FETCH_TIMEOUT_MS);
      return controller;
    };

    const finishAttemptTimeout = (controller: AbortController) => {
      clearTimeoutHandle();
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
    };

    for (let attempt = 0; attempt <= SILENT_AUDIT_RETRIES; attempt++) {
      if (!isCurrentRun()) {
        return;
      }

      if (attempt > 0) {
        await wait(SILENT_AUDIT_RETRY_DELAY_MS);
        if (!isCurrentRun()) {
          return;
        }
      }

      const controller = startAttemptTimeout();

      try {
        const response = await fetchWithAuth("/api/screen", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: requestBody,
        });

        if (!isCurrentRun()) {
          return;
        }

        let payload: unknown = null;
        try {
          payload = await readJsonResponse(response);
        } catch (parseError) {
          console.error("Deep screening response was unreadable:", parseError);
          showLiveAuditFailure(runId);
          return;
        }

        if (response.status === 202 || isScreeningAcceptedResponse(payload)) {
          if (!isScreeningAcceptedResponse(payload)) {
            showLiveAuditFailure(runId);
            return;
          }

          finishAttemptTimeout(controller);
          await watchQueuedScreening(payload.screening_id, runId);
          return;
        }

        const record = payload as (DeepScreeningResult & { error?: string }) | null;
        if (!response.ok) {
          const retryable =
            isIncompleteLiveGithubAudit(record?.error) &&
            attempt < SILENT_AUDIT_RETRIES;
          if (retryable) {
            continue;
          }
          showLiveAuditFailure(runId);
          return;
        }

        if (!record || typeof record.integrity_score !== "number") {
          showLiveAuditFailure(runId);
          return;
        }

        if (!isCurrentRun()) {
          return;
        }

        cacheAndShowResult(coerceDeepScreeningResult(record));
        clearStageInterval();
        return;
      } catch (err) {
        if (!isCurrentRun()) {
          return;
        }

        const retryable =
          isIncompleteLiveGithubAudit(err) && attempt < SILENT_AUDIT_RETRIES;
        if (retryable) {
          continue;
        }

        showLiveAuditFailure(runId);
        return;
      } finally {
        if (isCurrentRun()) {
          finishAttemptTimeout(controller);
        }
      }
    }

    if (isCurrentRun()) {
      showLiveAuditFailure(runId);
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
          <p className="text-[11px] text-textMuted leading-relaxed">
            GitHub crawl and Gemini scoring are running. Results appear here
            when the audit finishes.
          </p>
          {errorMessage ? (
            <p className="text-[11px] text-amber-200 leading-relaxed">{errorMessage}</p>
          ) : null}
        </div>
      )}

      {errorMessage && !loading && (
        <div
          role="status"
          className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-4 space-y-3"
        >
          <p className="text-xs text-amber-100 leading-relaxed">{errorMessage}</p>
          <button
            type="button"
            onClick={() => void runDeepScreening()}
            disabled={loading}
            className="w-full bg-amber-500/10 hover:bg-amber-500/15 border border-amber-500/25 text-amber-100 font-semibold py-2 rounded-lg text-xs transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
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

          {(result.timeline_flags ?? []).filter(
            (flag) => !result.scoreCap?.applied || !isFilesystemCapRedFlag(flag)
          ).length > 0 && (
            <div>
              <div className="text-[10px] uppercase font-bold text-red-400 tracking-wider mb-2">
                Timeline & Repository Flags
              </div>
              <ul className="space-y-1.5">
                {(result.timeline_flags ?? [])
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
