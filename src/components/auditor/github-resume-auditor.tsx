"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, ShieldCheck, Sparkles } from "lucide-react";
import type { AuditResult } from "@/app/api/audit/route";
import ResumeFileUpload, {
  type StoredResumeMeta,
} from "@/components/ResumeFileUpload";
import ExternalProjectsForm from "@/components/portfolio/external-projects-form";
import AuditResultsPanel from "@/components/auditor/audit-results-panel";
import ScorecardPublicationCallout from "@/components/auditor/scorecard-publication-callout";
import PrivateRepositoryBanner from "@/components/auditor/private-repository-banner";
import { normalizeAuditChecks } from "@/lib/audit-checks";
import { readJsonResponse } from "@/lib/read-json-response";
import {
  buildProductionAuditClaim,
  cachePendingProductionAudit,
  clearPendingProductionAudit,
  notifyProductionAuditUpdated,
  PRIVATE_AUDITED_REPO_LABEL,
  PRIVATE_AUDIT_INTENT,
  productionAuditRecordFromClaim,
  type ProductionAuditRecord,
} from "@/lib/production-audit";
import { isPrivateOrNotFoundAuditResponse } from "@/lib/inaccessible-public-audit";
import { emptyProductionAuditMetrics } from "@/lib/production-audit-metrics";
import { emptyScoreCapAudit } from "@/lib/repo-filesystem";
import { createClient } from "@/utils/supabase/client";
import {
  hasUsableExternalProjects,
  type ExternalProjectRecord,
} from "@/lib/external-projects";
import {
  getGitHubUrlValidationMessage,
  hasUsableGitHubAuditTarget,
} from "@/lib/validate-github-url";
import {
  DAILY_LIMIT_UI_MESSAGE,
  type DailyScanUsage,
} from "@/lib/daily-scan-limit";

const COMPENSATION_LEVELS = ["Junior", "Mid", "Senior"] as const;

const AUDIT_STAGES = [
  "Artifact Analysis (Check 1)...",
  "Architecture Review (Check 2)...",
  "API & Data Resiliency Check (Check 3)...",
] as const;

export default function GitHubResumeAuditor({
  initialGithubUrl = "",
  initialPrivateWork = false,
  onAuditPersisted,
}: {
  initialGithubUrl?: string;
  initialPrivateWork?: boolean;
  onAuditPersisted?: (record: ProductionAuditRecord) => void;
}) {
  const [targetRole, setTargetRole] = useState("");
  const [githubUrl, setGithubUrl] = useState(initialGithubUrl);
  const [resumeOpen, setResumeOpen] = useState(false);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [storedResume, setStoredResume] = useState<StoredResumeMeta | null>(
    null
  );
  const [compensationLevel, setCompensationLevel] =
    useState<(typeof COMPENSATION_LEVELS)[number]>("Mid");
  const [isPrivateWork, setIsPrivateWork] = useState(initialPrivateWork);
  const [externalProjects, setExternalProjects] = useState<
    ExternalProjectRecord[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [stageIndex, setStageIndex] = useState(0);
  const [result, setResult] = useState<AuditResult | null>(null);
  const [claim, setClaim] = useState<ReturnType<typeof buildProductionAuditClaim> | null>(
    null
  );
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

        const data = (await readJsonResponse(response)) as DailyScanUsage;
        if (!cancelled) {
          setLimitReached(Boolean(data.limit_reached));
        }
      } catch (err) {
        console.error("Could not load auditor scan usage:", err);
      }
    };

    const loadStoredResume = async () => {
      try {
        const response = await fetch("/api/profile/resume");
        if (response.status === 401) {
          return;
        }
        if (!response.ok) {
          return;
        }
        const data = (await readJsonResponse(response)) as StoredResumeMeta;
        if (!cancelled) {
          setStoredResume(data);
          if (data.hasResume) {
            setResumeOpen(true);
          }
        }
      } catch (err) {
        console.error("Could not load saved resume:", err);
      }
    };

    void loadUsage();
    void loadStoredResume();

    return () => {
      cancelled = true;
      if (stageIntervalRef.current) {
        clearInterval(stageIntervalRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (initialPrivateWork) {
      setIsPrivateWork(true);
    }
  }, [initialPrivateWork]);

  useEffect(() => {
    const intent = new URLSearchParams(window.location.search).get("intent");
    if (intent === PRIVATE_AUDIT_INTENT) {
      setIsPrivateWork(true);
    }
  }, []);

  const hasValidGithubInput = hasUsableGitHubAuditTarget(githubUrl);
  const hasPrivateArtifacts =
    isPrivateWork && hasUsableExternalProjects(externalProjects);
  const canSubmit = hasValidGithubInput || hasPrivateArtifacts;
  const githubValidationMessage =
    githubUrl.trim() && !hasValidGithubInput
      ? getGitHubUrlValidationMessage(githubUrl)
      : null;

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
    setClaim(null);
    startStageProgress();

    try {
      let response: Response;

      if (resumeFile) {
        const formData = new FormData();
        formData.append("targetRole", targetRole.trim());
        formData.append("githubUrl", githubUrl.trim());
        formData.append("compensationLevel", compensationLevel);
        formData.append("workIsPrivate", isPrivateWork ? "true" : "false");
        formData.append("externalProjects", JSON.stringify(externalProjects));
        formData.append("resumeFile", resumeFile);
        response = await fetch("/api/audit", {
          method: "POST",
          body: formData,
        });
      } else {
        response = await fetch("/api/audit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            targetRole: targetRole.trim(),
            githubUrl: githubUrl.trim(),
            compensationLevel,
            workIsPrivate: isPrivateWork,
            externalProjects,
          }),
        });
      }

      const data = (await readJsonResponse(response)) as AuditResult &
        DailyScanUsage & {
          error?: string;
          isPrivateOrNotFound?: boolean;
          inaccessibleRepo?: boolean;
        };

      if (!response.ok) {
        if (response.status === 429 || data.limit_reached) {
          setLimitReached(true);
        }
        throw new Error(data.error ?? "Audit request failed.");
      }

      setLimitReached(Boolean(data.limit_reached));

      if (isPrivateOrNotFoundAuditResponse(data)) {
        setResult({
          score: 0,
          strengths: [],
          redFlags: [],
          recommendations: [],
          checks: [],
          scoreCap: emptyScoreCapAudit(0),
          metrics: emptyProductionAuditMetrics(),
          filesystem: null,
          commitDates: [],
          inaccessibleRepo: true,
        });
        setClaim(null);
        return;
      }

      const nextResult = {
        ...data,
        checks: normalizeAuditChecks(data.checks),
        filesystem: data.filesystem ?? null,
        commitDates: data.commitDates ?? [],
        inaccessibleRepo: Boolean(data.inaccessibleRepo),
      };
      setResult(nextResult);

      if (nextResult.inaccessibleRepo) {
        setClaim(null);
        return;
      }

      const nextClaim = buildProductionAuditClaim({
        score: nextResult.score,
        githubUrl: isPrivateWork
          ? PRIVATE_AUDITED_REPO_LABEL
          : githubUrl.trim() || PRIVATE_AUDITED_REPO_LABEL,
        filesystem: nextResult.filesystem,
        scoreCap: nextResult.scoreCap,
        isPubliclyVisible: isPrivateWork ? false : undefined,
      });
      setClaim(nextClaim);
      try {
        const supabase = createClient();
        const { data: sessionData } = await supabase.auth.getUser();
        if (sessionData.user) {
          clearPendingProductionAudit();
          const record = productionAuditRecordFromClaim({
            ...nextClaim,
            is_publicly_visible: isPrivateWork
              ? false
              : nextClaim.is_publicly_visible,
          });
          notifyProductionAuditUpdated(record);
          onAuditPersisted?.(record);
        } else {
          cachePendingProductionAudit(nextClaim);
        }
      } catch {
        cachePendingProductionAudit(nextClaim);
      }
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
        <div className="inline-flex items-center gap-2 text-brand text-xs font-bold uppercase tracking-widest mb-2">
          <ShieldCheck className="w-4 h-4" aria-hidden="true" />
          Career Accelerator
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight text-textMain">
          Code & Resume Auditor
        </h1>
        <p className="text-textMuted text-sm mt-2 max-w-2xl">
          Deep-audit your GitHub artifacts, or private/enterprise project
          write-ups, against resume claims for founder-ready credibility.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-6 card-edge bg-panel rounded-2xl border border-border p-7 space-y-5">
          <div>
            <label className="block text-[11px] font-bold text-textMuted mb-2 uppercase tracking-wide">
              Target Role / Tech Stack
            </label>
            <input
              type="text"
              value={targetRole}
              onChange={(e) => setTargetRole(e.target.value)}
              placeholder="Full-Stack Next.js Developer"
              className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm text-textMain placeholder:text-textMuted focus:outline-none focus:border-brand"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-textMuted mb-2 uppercase tracking-wide">
              GitHub Profile / Repo URL
              {isPrivateWork ? (
                <span className="ml-1 font-medium normal-case tracking-normal text-textMuted">
                  (optional)
                </span>
              ) : null}
            </label>
            <input
              type="url"
              inputMode="url"
              autoComplete="url"
              spellCheck={false}
              value={githubUrl}
              onChange={(e) => setGithubUrl(e.target.value)}
              placeholder={
                isPrivateWork
                  ? "Optional — leave blank for private/enterprise work"
                  : "https://github.com/your-handle or repo URL"
              }
              aria-invalid={Boolean(githubValidationMessage)}
              aria-describedby={
                githubValidationMessage ? "github-url-validation" : undefined
              }
              className={`w-full bg-background rounded-xl px-4 py-2.5 text-sm text-textMain font-mono placeholder:text-textMuted focus:outline-none ${
 githubValidationMessage
 ? "border border-red-500/60 focus:border-red-400"
 : "border border-border focus:border-brand"
 }`}
            />
            {githubValidationMessage ? (
              <p
                id="github-url-validation"
                role="alert"
                className="mt-2 text-xs text-red-300"
              >
                {githubValidationMessage}
              </p>
            ) : null}
            <label className="mt-3 flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={isPrivateWork}
                onChange={(e) => setIsPrivateWork(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-border bg-background text-brand focus:ring-brand"
              />
              <span className="text-xs leading-relaxed text-textMuted">
                This work is private or enterprise — I do not have a public
                GitHub repository to audit.
              </span>
            </label>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-textMuted mb-2 uppercase tracking-wide">
              Target Compensation & Level
            </label>
            <select
              value={compensationLevel}
              onChange={(e) =>
                setCompensationLevel(
                  e.target.value as (typeof COMPENSATION_LEVELS)[number]
                )
              }
              className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm text-textMain focus:outline-none focus:border-brand"
            >
              {COMPENSATION_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </div>

          {isPrivateWork && (
            <div className="border-t border-border pt-4">
              <ExternalProjectsForm onProjectsChange={setExternalProjects} />
              {!hasUsableExternalProjects(externalProjects) ? (
                <p className="mt-3 text-xs text-amber-300/90">
                  Save at least one project artifact above so the auditor can
                  review your private or enterprise work instead of a public repo.
                </p>
              ) : null}
            </div>
          )}

          <div className="border-t border-border pt-1">
            <button
              type="button"
              onClick={() => setResumeOpen((open) => !open)}
              aria-expanded={resumeOpen}
              className="w-full text-left text-[13px] text-textMuted hover:text-textMuted transition-colors cursor-pointer py-2"
            >
              {resumeOpen ? "–" : "+"} Add resume for claim cross-verification
              <span className="text-zinc-600"> (Optional)</span>
            </button>
            {resumeOpen && (
              <div className="mt-1">
                <ResumeFileUpload
                  persistToProfile
                  localFallbackOnAuthError
                  initialFilename={storedResume?.filename ?? null}
                  helperText="The auditor reads the parsed resume and checks it against GitHub artifacts or your saved project write-ups."
                  onLocalFileChange={setResumeFile}
                  onPersisted={(meta) => {
                    setStoredResume(meta);
                    if (!meta.hasResume) {
                      setResumeFile(null);
                    }
                  }}
                />
              </div>
            )}
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
            className="w-full bg-brand hover:bg-brandHover disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3.5 rounded-md text-xs tracking-tight transition-colors duration-200 ease-out flex items-center justify-center gap-2 cursor-pointer"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                Running AI Audit...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" aria-hidden="true" />
                Run AI Audit
              </>
            )}
          </button>
        </div>

        <div className="lg:col-span-6 card-edge bg-panel rounded-2xl border border-border p-4 sm:p-6 min-h-[320px] lg:min-h-[480px] lg:max-h-[calc(100vh-6rem)] overflow-visible lg:overflow-y-auto">
          {loading && (
            <div className="space-y-4">
              <div className="text-sm font-bold text-textMain mb-1">
                Running credibility audit
              </div>
              <p className="text-xs text-textMuted mb-4">
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
            <div className="space-y-4">
              {result.inaccessibleRepo ? (
                <>
                  <PrivateRepositoryBanner variant="dashboard" />
                  <div className="rounded-2xl border border-border bg-background p-4 space-y-3">
                    <p className="text-sm text-textMuted leading-relaxed">
                      Enable{" "}
                      <span className="font-semibold text-textMain">
                        private or enterprise work
                      </span>{" "}
                      below and add project write-ups to audit without requiring a
                      public repository URL.
                    </p>
                    <button
                      type="button"
                      onClick={() => setIsPrivateWork(true)}
                      className="inline-flex items-center justify-center rounded-md border border-border bg-brand text-white px-4 py-2.5 text-sm font-medium transition-colors hover:bg-brandHover cursor-pointer"
                    >
                      Switch to Private Auditor
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <AuditResultsPanel result={result} />
                  {claim ? <ScorecardPublicationCallout claim={claim} /> : null}
                </>
              )}
            </div>
          )}

          {!loading && !result && !error && (
            <div className="flex flex-col items-center justify-center text-center min-h-[360px] px-4">
              <div className="w-14 h-14 rounded-2xl bg-brand/15 border border-brand/25 flex items-center justify-center mb-4 text-textMain">
                <ShieldCheck className="w-7 h-7 text-brand" aria-hidden="true" />
              </div>
              <h2 className="text-base font-bold text-textMain mb-2">
                Audit results will appear here
              </h2>
              <p className="text-sm text-textMuted leading-relaxed max-w-sm">
                Provix runs Artifact Analysis, Architecture Review, and an API
                & Data Resiliency Check, then produces a founder-ready
                credibility score.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
