"use client";

import { useEffect, useRef, useState } from "react";
import {
  Check,
  Copy,
  Loader2,
  Megaphone,
  PenTool,
  Sparkles,
} from "lucide-react";
import type { PitchStudioResult } from "@/lib/pitch-studio-types";
import { readJsonResponse } from "@/lib/read-json-response";

const TONE_OPTIONS = [
  "Direct & High Signal",
  "Technical & Proof-Driven",
  "Casual Founder DM",
] as const;

const PITCH_STAGES = [
  "Analyzing company context...",
  "Extracting key proof points...",
  "Structuring founder-ready outreach...",
] as const;

export default function PitchStudioPanel() {
  const [targetCompany, setTargetCompany] = useState("");
  const [targetContactRole, setTargetContactRole] = useState("");
  const [roleApplyingFor, setRoleApplyingFor] = useState("");
  const [coreValueProp, setCoreValueProp] = useState("");
  const [tone, setTone] = useState<(typeof TONE_OPTIONS)[number]>(
    "Direct & High Signal"
  );
  const [loading, setLoading] = useState(false);
  const [stageIndex, setStageIndex] = useState(0);
  const [result, setResult] = useState<PitchStudioResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const stageIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (stageIntervalRef.current) {
        clearInterval(stageIntervalRef.current);
      }
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  const canSubmit =
    targetCompany.trim() || roleApplyingFor.trim() || coreValueProp.trim();

  const startStageProgress = () => {
    setStageIndex(0);
    if (stageIntervalRef.current) {
      clearInterval(stageIntervalRef.current);
    }
    stageIntervalRef.current = setInterval(() => {
      setStageIndex((current) =>
        current < PITCH_STAGES.length - 1 ? current + 1 : current
      );
    }, 1400);
  };

  const stopStageProgress = () => {
    if (stageIntervalRef.current) {
      clearInterval(stageIntervalRef.current);
      stageIntervalRef.current = null;
    }
  };

  const generatePitches = async () => {
    if (!canSubmit || loading) {
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    setCopiedIndex(null);
    startStageProgress();

    try {
      const response = await fetch("/api/pitch-studio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetCompany: targetCompany.trim(),
          targetContactRole: targetContactRole.trim(),
          roleApplyingFor: roleApplyingFor.trim(),
          coreValueProp: coreValueProp.trim(),
          tone,
        }),
      });

      const data = (await readJsonResponse(response)) as PitchStudioResult & {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error ?? "Pitch generation failed.");
      }

      setResult(data);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not generate pitches.";
      setError(message);
    } finally {
      stopStageProgress();
      setLoading(false);
    }
  };

  const handleCopyPitch = async (body: string, index: number) => {
    try {
      await navigator.clipboard.writeText(body);
      setCopiedIndex(index);
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
      copyTimeoutRef.current = setTimeout(() => {
        setCopiedIndex(null);
      }, 2000);
    } catch {
      setError("Could not copy to clipboard.");
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto space-y-10">
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 text-brand text-xs font-bold uppercase tracking-widest mb-2">
            <PenTool className="w-4 h-4" aria-hidden />
            Career Accelerator
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-textMain">
            Pitch Studio
          </h1>
          <p className="text-textMuted text-sm mt-2 max-w-2xl">
            Generate high-signal outreach that lands in founder inboxes — not ATS
            black holes.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-6 card-edge bg-panel rounded-2xl border border-border p-7 space-y-5">
            <div>
              <label className="block text-[11px] font-bold text-textMuted mb-2 uppercase tracking-wide">
                Target Company / Startup Name
              </label>
              <input
                type="text"
                value={targetCompany}
                onChange={(e) => setTargetCompany(e.target.value)}
                placeholder="Acme AI"
                className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm text-textMain placeholder:text-textMuted focus:outline-none focus:border-brand"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-textMuted mb-2 uppercase tracking-wide">
                Target Contact Role
              </label>
              <input
                type="text"
                value={targetContactRole}
                onChange={(e) => setTargetContactRole(e.target.value)}
                placeholder="Founder / Head of Engineering"
                className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm text-textMain placeholder:text-textMuted focus:outline-none focus:border-brand"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-textMuted mb-2 uppercase tracking-wide">
                Role Applying For
              </label>
              <input
                type="text"
                value={roleApplyingFor}
                onChange={(e) => setRoleApplyingFor(e.target.value)}
                placeholder="Full-Stack Engineer"
                className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm text-textMain placeholder:text-textMuted focus:outline-none focus:border-brand"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-textMuted mb-2 uppercase tracking-wide">
                Core Value Prop / Top Project Built
              </label>
              <textarea
                rows={4}
                value={coreValueProp}
                onChange={(e) => setCoreValueProp(e.target.value)}
                placeholder="Built a Next.js SaaS with 500 users, cut onboarding time 40%, and shipped auth + billing in 3 weeks..."
                className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm text-textMain placeholder:text-textMuted resize-none focus:outline-none focus:border-brand leading-relaxed"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-textMuted mb-2 uppercase tracking-wide">
                Tone
              </label>
              <select
                value={tone}
                onChange={(e) =>
                  setTone(e.target.value as (typeof TONE_OPTIONS)[number])
                }
                className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm text-textMain focus:outline-none focus:border-brand"
              >
                {TONE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={() => void generatePitches()}
              disabled={loading || !canSubmit}
              className="w-full bg-brand hover:bg-brandHover disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3.5 rounded-xl text-xs transition-all flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
                  Generating Pitches...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" aria-hidden />
                  Generate High-Impact Pitches
                </>
              )}
            </button>
          </div>

          <div className="lg:col-span-6 card-edge bg-panel rounded-2xl border border-border p-6 min-h-[480px]">
            {loading && (
              <div className="space-y-4">
                <div className="text-sm font-bold text-textMain mb-1">
                  Crafting outreach templates
                </div>
                <p className="text-xs text-textMuted mb-4">
                  Provix AI is tailoring pitches to your company target and
                  proof-of-work.
                </p>
                <ul className="space-y-3">
                  {PITCH_STAGES.map((stage, index) => {
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
                    Generated Templates
                  </div>
                  <div className="text-lg font-bold text-textMain">
                    3 Founder-Ready Pitches
                  </div>
                </div>

                {result.pitches.map((pitch, index) => (
                  <div
                    key={`${pitch.title}-${index}`}
                    className="rounded-xl border border-border bg-background p-4 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-bold text-textMain">
                          {pitch.title}
                        </div>
                        <div className="text-[10px] uppercase font-bold text-brand tracking-wider mt-1">
                          {pitch.channel}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleCopyPitch(pitch.body, index)}
                        className="inline-flex items-center gap-1.5 shrink-0 rounded-lg border border-border bg-panel px-2.5 py-1.5 text-[11px] font-semibold text-textMuted hover:border-brand/40 hover:text-textMain transition-colors"
                      >
                        {copiedIndex === index ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-400" aria-hidden />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" aria-hidden />
                            Copy
                          </>
                        )}
                      </button>
                    </div>

                    <p className="text-sm text-textMuted leading-relaxed whitespace-pre-wrap">
                      {pitch.body}
                    </p>

                    {pitch.copyTip && (
                      <p className="text-xs text-textMuted border-t border-border pt-3">
                        <span className="font-bold text-textMuted">Tip: </span>
                        {pitch.copyTip}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {!loading && !result && !error && (
              <div className="flex flex-col items-center justify-center text-center min-h-[360px] px-4">
                <div className="w-14 h-14 rounded-2xl bg-brand/15 border border-brand/25 flex items-center justify-center mb-4 text-textMain">
                  <Megaphone className="w-7 h-7 text-brand" aria-hidden />
                </div>
                <h2 className="text-base font-bold text-textMain mb-2">
                  Your pitches will appear here
                </h2>
                <p className="text-sm text-textMuted leading-relaxed max-w-sm">
                  Direct founder outreach bypasses ATS keyword filters. Provix
                  generates DM, email, and video intro scripts tailored to your
                  proof-of-work and target company.
                </p>
              </div>
            )}
          </div>
        </div>
    </div>
  );
}
