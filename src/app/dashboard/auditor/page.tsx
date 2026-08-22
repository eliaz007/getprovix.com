"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type { AuditResult } from "@/app/api/audit/route";
import {
  DAILY_LIMIT_UI_MESSAGE,
  type DailyScanUsage,
} from "@/lib/daily-scan-limit";

const COMPENSATION_LEVELS = ["Junior", "Mid", "Senior"] as const;

const AUDIT_STAGES = [
  "Scanning repository architecture...",
  "Evaluating resume proof-of-work...",
  "Generating hiring readiness score...",
] as const;

function getScoreBadgeClass(score: number): string {
  if (score >= 80) {
    return "text-emerald-400 bg-emerald-500/10 border-emerald-500/30";
  }
  if (score >= 60) {
    return "text-amber-400 bg-amber-500/10 border-amber-500/30";
  }
  return "text-red-400 bg-red-500/10 border-red-500/30";
}

export default function AuditorPage() {
  const [targetRole, setTargetRole] = useState("");
  const [githubUrl, setGithubUrl] = useState("");
  const [resumeSummary, setResumeSummary] = useState("");
  const [compensationLevel, setCompensationLevel] =
    useState<(typeof COMPENSATION_LEVELS)[number]>("Mid");
  const [loading, setLoading] = useState(false);
  const [stageIndex, setStageIndex] = useState(0);
  const [result, setResult] = useState<AuditResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [limitReached, setLimitReached] = useState(false);
  const stageIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadUsage = async () => {
      try {
        const response = await fetch("/api/audit");
        if (!response.ok) {
          return;
        }

        const data = (await response.json()) as DailyScanUsage;
        if (!cancelled) {
          setLimitReached(Boolean(data.limit_reached));
        }
      } catch (err) {
        console.error("Could not load auditor scan usage:", err);
      }
    };

    void loadUsage();

    return () => {
      cancelled = true;
      if (stageIntervalRef.current) {
        clearInterval(stageIntervalRef.current);
      }
    };
  }, []);

  const canSubmit =
    targetRole.trim() || githubUrl.trim() || resumeSummary.trim();

  const startStageProgress = () => {
    setStageIndex(0);
    if (stageIntervalRef.current) {
      clearInterval(stageIntervalRef.current);
    }
    stageIntervalRef.current = setInterval(() => {
      setStageIndex((current) =>
        current < AUDIT_STAGES.length - 1 ? current + 1 : current
      );
    }, 1400);
  };

  const stopStageProgress = () => {
    if (stageIntervalRef.current) {
      clearInterval(stageIntervalRef.current);
      stageIntervalRef.current = null;
    }
  };

  const runAudit = async () => {
    if (!canSubmit || loading || limitReached) {
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    startStageProgress();

    try {
      const response = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetRole: targetRole.trim(),
          githubUrl: githubUrl.trim(),
          resumeSummary: resumeSummary.trim(),
          compensationLevel,
        }),
      });

      const data = (await response.json()) as AuditResult &
        DailyScanUsage & { error?: string };

      if (!response.ok) {
        if (response.status === 429 || data.limit_reached) {
          setLimitReached(true);
        }
        throw new Error(data.error ?? "Audit request failed.");
      }

      setLimitReached(Boolean(data.limit_reached));
      setResult(data);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not complete audit.";
      setError(message);
    } finally {
      stopStageProgress();
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto space-y-10">
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 text-indigo-400 text-xs font-bold uppercase tracking-widest mb-2">
            <ShieldCheck className="w-4 h-4" aria-hidden />
            Career Accelerator
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white">
            GitHub &amp; Resume Auditor
          </h1>
          <p className="text-slate-400 text-sm mt-2 max-w-2xl">
            Deep-audit your GitHub artifacts and resume claims for founder-ready
            credibility — before recruiters do.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-6 bg-[#111111] rounded-2xl border border-slate-800/60 p-7 space-y-5 shadow-2xl">
            <div>
              <label className="block text-[11px] font-bold text-slate-400 mb-2 uppercase tracking-wide">
                Target Role / Tech Stack
              </label>
              <input
                type="text"
                value={targetRole}
                onChange={(e) => setTargetRole(e.target.value)}
                placeholder="Full-Stack Next.js Developer"
                className="w-full bg-[#0A0A0A] border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-400 mb-2 uppercase tracking-wide">
                GitHub Profile / Repo URL
              </label>
              <input
                type="text"
                value={githubUrl}
                onChange={(e) => setGithubUrl(e.target.value)}
                placeholder="https://github.com/your-handle or repo URL"
                className="w-full bg-[#0A0A0A] border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-400 mb-2 uppercase tracking-wide">
                Paste Resume / Experience Summary
              </label>
              <textarea
                rows={6}
                value={resumeSummary}
                onChange={(e) => setResumeSummary(e.target.value)}
                placeholder="Summarize roles, shipped projects, metrics, and stack evidence..."
                className="w-full bg-[#0A0A0A] border border-slate-800 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 resize-none focus:outline-none focus:border-indigo-500 leading-relaxed"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-400 mb-2 uppercase tracking-wide">
                Target Compensation &amp; Level
              </label>
              <select
                value={compensationLevel}
                onChange={(e) =>
                  setCompensationLevel(
                    e.target.value as (typeof COMPENSATION_LEVELS)[number]
                  )
                }
                className="w-full bg-[#0A0A0A] border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
              >
                {COMPENSATION_LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </select>
            </div>

            {limitReached && (
              <div
                role="status"
                className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-200"
              >
                {DAILY_LIMIT_UI_MESSAGE}
              </div>
            )}

            <button
              type="button"
              onClick={() => void runAudit()}
              disabled={loading || !canSubmit || limitReached}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3.5 rounded-xl text-xs transition-all flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
                  Running AI Audit...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" aria-hidden />
                  Run AI Audit
                </>
              )}
            </button>
          </div>

          <div className="lg:col-span-6 bg-[#111111] rounded-2xl border border-slate-800/60 p-6 min-h-[480px] shadow-2xl">
            {loading && (
              <div className="space-y-4 animate-in fade-in duration-300">
                <div className="text-sm font-bold text-white mb-1">
                  Running credibility audit
                </div>
                <p className="text-xs text-slate-500 mb-4">
                  Provix AI is cross-checking your artifacts against your stated
                  role and level.
                </p>
                <ul className="space-y-3">
                  {AUDIT_STAGES.map((stage, index) => {
                    const isComplete = index < stageIndex;
                    const isActive = index === stageIndex;

                    return (
                      <li
                        key={stage}
                        className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 transition-all ${
                          isComplete
                            ? "border-emerald-500/25 bg-emerald-500/5"
                            : isActive
                              ? "border-indigo-500/30 bg-indigo-500/10"
                              : "border-slate-800 bg-[#0A0A0A]"
                        }`}
                      >
                        <span
                          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold ${
                            isComplete
                              ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-400"
                              : isActive
                                ? "border-indigo-500/40 bg-indigo-500/15 text-indigo-300"
                                : "border-slate-700 text-slate-600"
                          }`}
                        >
                          {isComplete ? (
                            <Check className="h-3 w-3" aria-hidden />
                          ) : isActive ? (
                            <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
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
                                : "text-slate-500"
                          }`}
                        >
                          {stage}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {!loading && error && (
              <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            )}

            {!loading && result && (
              <div className="space-y-6 animate-in fade-in duration-500">
                <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                  <div>
                    <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-1">
                      Overall Readiness Score
                    </div>
                    <div className="text-lg font-bold text-white">
                      Hiring Readiness
                    </div>
                  </div>
                  <div
                    className={`px-3 py-1.5 rounded-full border text-xl font-mono font-bold ${getScoreBadgeClass(result.score)}`}
                  >
                    {result.score}/100
                  </div>
                </div>

                <div>
                  <div className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider mb-3">
                    Verified Strengths
                  </div>
                  <ul className="space-y-2">
                    {result.strengths.map((item) => (
                      <li
                        key={item}
                        className="flex items-start gap-2 text-sm text-slate-300 leading-relaxed"
                      >
                        <CheckCircle2
                          className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5"
                          aria-hidden
                        />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <div className="text-[10px] uppercase font-bold text-amber-400 tracking-wider mb-3">
                    Detected Red Flags / Missing Proof-of-Work
                  </div>
                  <ul className="space-y-2">
                    {result.redFlags.map((item) => (
                      <li
                        key={item}
                        className="flex items-start gap-2 text-sm text-slate-300 leading-relaxed"
                      >
                        <AlertTriangle
                          className="w-4 h-4 text-amber-400 shrink-0 mt-0.5"
                          aria-hidden
                        />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <div className="text-[10px] uppercase font-bold text-indigo-400 tracking-wider mb-3">
                    Actionable Fixes
                  </div>
                  <ol className="space-y-2 list-decimal list-inside">
                    {result.recommendations.map((item) => (
                      <li
                        key={item}
                        className="text-sm text-slate-300 leading-relaxed pl-1"
                      >
                        {item}
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            )}

            {!loading && !result && !error && (
              <div className="flex flex-col items-center justify-center text-center min-h-[360px] px-4">
                <div className="w-14 h-14 rounded-2xl bg-indigo-600/15 border border-indigo-500/25 flex items-center justify-center mb-4">
                  <ShieldCheck className="w-7 h-7 text-indigo-400" aria-hidden />
                </div>
                <h2 className="text-base font-bold text-white mb-2">
                  Audit results will appear here
                </h2>
                <p className="text-sm text-slate-500 leading-relaxed max-w-sm">
                  Provix analyzes repository architecture signals, resume
                  proof-of-work depth, timeline plausibility, and role alignment
                  to produce a founder-ready credibility score.
                </p>
              </div>
            )}
          </div>
        </div>
    </div>
  );
}
