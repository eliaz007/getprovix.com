"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  Loader2,
  Sparkles,
  Terminal,
} from "lucide-react";
import type { InterviewSimulatorResult } from "@/app/api/interview-simulator/route";
import { readJsonResponse } from "@/lib/read-json-response";

const INTERVIEW_ROUNDS = [
  "Initial Technical Screen",
  "System Design & Architecture",
  "Behavioral & Culture Fit",
] as const;

const COMPANY_TYPES = [
  "Early-Stage Startup",
  "High-Growth Scaleup",
  "Enterprise",
] as const;

const SIMULATION_STAGES = [
  "Parsing tech stack requirements...",
  "Simulating hiring manager line of questioning...",
  "Generating cheat sheet...",
] as const;

export default function InterviewPrepPage() {
  const [targetJobTitle, setTargetJobTitle] = useState("");
  const [coreTechStack, setCoreTechStack] = useState("");
  const [interviewRound, setInterviewRound] =
    useState<(typeof INTERVIEW_ROUNDS)[number]>("Initial Technical Screen");
  const [companyType, setCompanyType] =
    useState<(typeof COMPANY_TYPES)[number]>("Early-Stage Startup");
  const [loading, setLoading] = useState(false);
  const [stageIndex, setStageIndex] = useState(0);
  const [result, setResult] = useState<InterviewSimulatorResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedQuestions, setExpandedQuestions] = useState<Set<number>>(
    new Set()
  );
  const stageIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (stageIntervalRef.current) {
        clearInterval(stageIntervalRef.current);
      }
    };
  }, []);

  const canSubmit = targetJobTitle.trim() || coreTechStack.trim();

  const startStageProgress = () => {
    setStageIndex(0);
    if (stageIntervalRef.current) {
      clearInterval(stageIntervalRef.current);
    }
    stageIntervalRef.current = setInterval(() => {
      setStageIndex((current) =>
        current < SIMULATION_STAGES.length - 1 ? current + 1 : current
      );
    }, 1400);
  };

  const stopStageProgress = () => {
    if (stageIntervalRef.current) {
      clearInterval(stageIntervalRef.current);
      stageIntervalRef.current = null;
    }
  };

  const toggleQuestion = (index: number) => {
    setExpandedQuestions((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const generateSimulation = async () => {
    if (!canSubmit || loading) {
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    setExpandedQuestions(new Set());
    startStageProgress();

    try {
      const response = await fetch("/api/interview-simulator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetJobTitle: targetJobTitle.trim(),
          coreTechStack: coreTechStack.trim(),
          interviewRound,
          companyType,
        }),
      });

      const data = (await readJsonResponse(response)) as InterviewSimulatorResult & {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error ?? "Interview simulation failed.");
      }

      setResult(data);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not generate simulation.";
      setError(message);
    } finally {
      stopStageProgress();
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto space-y-10">
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 text-brand text-xs font-bold uppercase tracking-widest mb-2">
            <Terminal className="w-4 h-4" aria-hidden />
            Career Accelerator
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-textMain">
            Interview Simulator
          </h1>
          <p className="text-textMuted text-sm mt-2 max-w-2xl">
            Rehearse technical, architecture, and behavioral rounds with
            hiring-manager-grade questions and cheat sheets.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-6 card-edge bg-panel rounded-2xl border border-border p-7 space-y-5">
            <div>
              <label className="block text-[11px] font-bold text-textMuted mb-2 uppercase tracking-wide">
                Target Job Title
              </label>
              <input
                type="text"
                value={targetJobTitle}
                onChange={(e) => setTargetJobTitle(e.target.value)}
                placeholder="Junior Backend Engineer"
                className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm text-textMain placeholder:text-textMuted focus:outline-none focus:border-brand"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-textMuted mb-2 uppercase tracking-wide">
                Core Tech Stack
              </label>
              <input
                type="text"
                value={coreTechStack}
                onChange={(e) => setCoreTechStack(e.target.value)}
                placeholder="Next.js, PostgreSQL, REST APIs"
                className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm text-textMain placeholder:text-textMuted focus:outline-none focus:border-brand"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-textMuted mb-2 uppercase tracking-wide">
                Interview Round
              </label>
              <select
                value={interviewRound}
                onChange={(e) =>
                  setInterviewRound(
                    e.target.value as (typeof INTERVIEW_ROUNDS)[number]
                  )
                }
                className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm text-textMain focus:outline-none focus:border-brand"
              >
                {INTERVIEW_ROUNDS.map((round) => (
                  <option key={round} value={round}>
                    {round}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-textMuted mb-2 uppercase tracking-wide">
                Company Type
              </label>
              <select
                value={companyType}
                onChange={(e) =>
                  setCompanyType(
                    e.target.value as (typeof COMPANY_TYPES)[number]
                  )
                }
                className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm text-textMain focus:outline-none focus:border-brand"
              >
                {COMPANY_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={() => void generateSimulation()}
              disabled={loading || !canSubmit}
              className="w-full bg-brand hover:bg-brandHover disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3.5 rounded-xl text-xs transition-all flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
                  Generating Simulation...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" aria-hidden />
                  Generate Interview Simulation
                </>
              )}
            </button>
          </div>

          <div className="lg:col-span-6 card-edge bg-panel rounded-2xl border border-border p-6 min-h-[480px]">
            {loading && (
              <div className="space-y-4">
                <div className="text-sm font-bold text-textMain mb-1">
                  Building your interview cheat sheet
                </div>
                <p className="text-xs text-textMuted mb-4">
                  Provix AI is modeling how a hiring manager would probe your
                  stack and round type.
                </p>
                <ul className="space-y-3">
                  {SIMULATION_STAGES.map((stage, index) => {
                    const isComplete = index < stageIndex;
                    const isActive = index === stageIndex;

                    return (
                      <li
                        key={stage}
                        className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 transition-all ${
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
 : "text-textMuted"
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
              <div className="space-y-5">
                <div className="pb-4 border-b border-border">
                  <div className="text-[10px] uppercase font-bold text-textMuted tracking-wider mb-1">
                    Interview Cheat Sheet
                  </div>
                  <div className="text-lg font-bold text-textMain">
                    4 Core Questions + Grader Notes
                  </div>
                </div>

                <div className="space-y-3">
                  {result.questions.map((item, index) => {
                    const isExpanded = expandedQuestions.has(index);

                    return (
                      <div
                        key={`${item.question}-${index}`}
                        className="rounded-xl border border-border bg-background overflow-hidden"
                      >
                        <button
                          type="button"
                          onClick={() => toggleQuestion(index)}
                          className="w-full flex items-start justify-between gap-3 p-4 text-left hover:bg-background/40 transition-colors"
                        >
                          <div className="flex items-start gap-3">
                            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brandGlow border border-brand/30 text-[11px] font-bold text-brand">
                              {index + 1}
                            </span>
                            <p className="text-sm font-semibold text-textMain leading-relaxed">
                              {item.question}
                            </p>
                          </div>
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4 text-textMuted shrink-0 mt-1" aria-hidden />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-textMuted shrink-0 mt-1" aria-hidden />
                          )}
                        </button>

                        {isExpanded && (
                          <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
                            <div>
                              <div className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider mb-2">
                                Ideal Answer Structure
                              </div>
                              <p className="text-sm text-textMuted leading-relaxed">
                                {item.idealAnswer}
                              </p>
                            </div>

                            {item.talkingPoints.length > 0 && (
                              <div>
                                <div className="text-[10px] uppercase font-bold text-brand tracking-wider mb-2">
                                  Key Talking Points
                                </div>
                                <ul className="space-y-1.5">
                                  {item.talkingPoints.map((point) => (
                                    <li
                                      key={point}
                                      className="flex items-start gap-2 text-sm text-textMuted"
                                    >
                                      <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" aria-hidden />
                                      <span>{point}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-4">
                  <div className="flex items-center gap-2 text-[10px] uppercase font-bold text-amber-400 tracking-wider mb-2">
                    <AlertTriangle className="w-3.5 h-3.5" aria-hidden />
                    Top Technical Trap / Pitfall
                  </div>
                  <p className="text-sm text-textMuted leading-relaxed">
                    {result.technicalTrap}
                  </p>
                </div>

                <div className="rounded-xl border border-brand/25 bg-brandGlow p-4">
                  <div className="flex items-center gap-2 text-[10px] uppercase font-bold text-brand tracking-wider mb-2">
                    <HelpCircle className="w-3.5 h-3.5" aria-hidden />
                    Smart Question to Ask the Interviewer
                  </div>
                  <p className="text-sm text-textMuted leading-relaxed">
                    {result.closingQuestion}
                  </p>
                </div>
              </div>
            )}

            {!loading && !result && !error && (
              <div className="flex flex-col items-center justify-center text-center min-h-[360px] px-4">
                <div className="w-14 h-14 rounded-2xl bg-brand/15 border border-brand/25 flex items-center justify-center mb-4 text-textMain">
                  <Terminal className="w-7 h-7 text-brand" aria-hidden />
                </div>
                <h2 className="text-base font-bold text-textMain mb-2">
                  Your simulation will appear here
                </h2>
                <p className="text-sm text-textMuted leading-relaxed max-w-sm">
                  Technical and architecture rounds are graded on structured
                  reasoning, tradeoff clarity, and proof-of-work — not buzzwords.
                  Provix generates realistic questions with ideal answers and
                  grader talking points.
                </p>
              </div>
            )}
          </div>
        </div>
    </div>
  );
}
