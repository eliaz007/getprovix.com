"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  Check,
  Code2,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import type { AuditResult } from "@/app/api/audit/route";
import ScoreMeter from "@/components/ScoreMeter";
import { normalizeAuditChecks } from "@/lib/audit-checks";
import { DAILY_LIMIT_UI_MESSAGE, type DailyScanUsage } from "@/lib/daily-scan-limit";
import {
  buildProductionAuditClaim,
  cachePendingProductionAudit,
  claimAuditLoginHref,
  clearPendingProductionAudit,
  formatAuditedRepoLabel,
  getProductionScoreBadge,
  type ProductionAuditClaim,
} from "@/lib/production-audit";
import ScorecardPublicationCallout from "@/components/auditor/scorecard-publication-callout";
import PrivateRepositoryBanner from "@/components/auditor/private-repository-banner";
import { isFilesystemCapRedFlag } from "@/lib/repo-filesystem";
import {
  isInaccessiblePublicAudit,
  isPrivateOrNotFoundAuditResponse,
} from "@/lib/inaccessible-public-audit";
import {
  getGitHubUrlValidationMessage,
  hasUsableGitHubAuditTarget,
} from "@/lib/validate-github-url";
import { createClient } from "@/utils/supabase/client";

const AUDIT_STAGES = [
  "Artifact Analysis (Check 1)...",
  "Architecture Review (Check 2)...",
  "API & Data Resiliency Check (Check 3)...",
] as const;

const TALENT_HREF = "/employer";

function SubMetric({ label, score }: { label: string; score: number }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-textMuted">
          {label}
        </span>
        <span className="font-mono text-[11px] font-semibold text-textMain">
          {score}/100
        </span>
      </div>
      <ScoreMeter score={score} className="text-textMain" />
    </div>
  );
}

function FindingList({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: "pass" | "warn" | "fix";
}) {
  if (items.length === 0) {
    return null;
  }

  const iconClass =
    tone === "pass"
      ? "text-emerald-400"
      : tone === "warn"
        ? "text-amber-400"
        : "text-brand";

  return (
    <div>
      <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-textMuted">
        {title}
      </p>
      <ul className="space-y-2">
        {items.map((item) => (
          <li
            key={item}
            className="flex items-start gap-2 text-sm leading-relaxed text-textMuted"
          >
            {tone === "pass" ? (
              <Check className={`mt-0.5 h-4 w-4 shrink-0 ${iconClass}`} aria-hidden />
            ) : (
              <AlertTriangle
                className={`mt-0.5 h-4 w-4 shrink-0 ${iconClass}`}
                aria-hidden
              />
            )}
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function PublicProductionAudit({
  initialRepoUrl = "",
}: {
  initialRepoUrl?: string;
}) {
  const router = useRouter();
  const [repoUrl, setRepoUrl] = useState(initialRepoUrl);
  const [loading, setLoading] = useState(() =>
    hasUsableGitHubAuditTarget(initialRepoUrl)
  );
  const [stageIndex, setStageIndex] = useState(0);
  const [result, setResult] = useState<AuditResult | null>(null);
  const [claim, setClaim] = useState<ProductionAuditClaim | null>(null);
  const [inaccessibleRepo, setInaccessibleRepo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limitReached, setLimitReached] = useState(false);
  const stageIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoStartedRef = useRef("");
  const inFlightRef = useRef(false);

  const hasValidGithubInput = hasUsableGitHubAuditTarget(repoUrl);
  const githubValidationMessage =
    repoUrl.trim() && !hasValidGithubInput
      ? getGitHubUrlValidationMessage(repoUrl)
      : null;

  const stopStageProgress = () => {
    if (stageIntervalRef.current) {
      clearInterval(stageIntervalRef.current);
      stageIntervalRef.current = null;
    }
  };

  const startStageProgress = () => {
    setStageIndex(0);
    stopStageProgress();
    stageIntervalRef.current = setInterval(() => {
      setStageIndex((current) =>
        current < AUDIT_STAGES.length - 1 ? current + 1 : current
      );
    }, 1400);
  };

  const runAudit = async (url: string) => {
    const trimmed = url.trim();
    if (
      !hasUsableGitHubAuditTarget(trimmed) ||
      inFlightRef.current ||
      limitReached
    ) {
      return;
    }

    inFlightRef.current = true;
    setLoading(true);
    setError(null);
    setResult(null);
    setClaim(null);
    setInaccessibleRepo(false);
    startStageProgress();

    try {
      const response = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          githubUrl: trimmed,
          compensationLevel: "Mid",
        }),
      });

      let data: AuditResult &
        DailyScanUsage & {
          error?: string;
          isPrivateOrNotFound?: boolean;
          repoUrl?: string;
          inaccessibleRepo?: boolean;
        };
      try {
        data = (await response.json()) as typeof data;
      } catch {
        if (response.status === 404 || response.status === 403) {
          setInaccessibleRepo(true);
          setResult(null);
          setClaim(null);
          return;
        }
        throw new Error("Audit request failed.");
      }

      if (
        isPrivateOrNotFoundAuditResponse(data) ||
        isInaccessiblePublicAudit({ status: response.status, result: data })
      ) {
        setLimitReached(Boolean(data.limit_reached));
        setInaccessibleRepo(true);
        setResult(null);
        setClaim(null);
        return;
      }

      if (!response.ok) {
        if (response.status === 429 || data.limit_reached) {
          setLimitReached(true);
        }
        throw new Error(data.error ?? "Audit request failed.");
      }

      // Guard: never treat a score-only payload without real audit fields as success
      // when private/not-found markers are present.
      if (typeof data.score !== "number" || !Array.isArray(data.redFlags)) {
        throw new Error(data.error ?? "Audit request failed.");
      }

      setLimitReached(Boolean(data.limit_reached));
      const nextResult = {
        ...data,
        checks: normalizeAuditChecks(data.checks),
        filesystem: data.filesystem ?? null,
        commitDates: data.commitDates ?? [],
      };
      setResult(nextResult);

      const nextClaim = buildProductionAuditClaim({
        score: nextResult.score,
        githubUrl: trimmed,
        filesystem: nextResult.filesystem,
        scoreCap: nextResult.scoreCap,
      });
      setClaim(nextClaim);

      try {
        const supabase = createClient();
        const { data: sessionData } = await supabase.auth.getUser();
        if (sessionData.user) {
          clearPendingProductionAudit();
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
      inFlightRef.current = false;
      setLoading(false);
    }
  };

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
      stopStageProgress();
    };
  }, []);

  useEffect(() => {
    const trimmed = initialRepoUrl.trim();
    if (!hasUsableGitHubAuditTarget(trimmed)) {
      return;
    }
    if (autoStartedRef.current === trimmed) {
      return;
    }
    autoStartedRef.current = trimmed;
    void runAudit(trimmed);
    // Auto-run once per incoming repo query from the landing hero.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialRepoUrl]);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = repoUrl.trim();
    if (trimmed === initialRepoUrl.trim()) {
      void runAudit(trimmed);
      return;
    }
    router.push(`/audit?repo=${encodeURIComponent(trimmed)}`);
  };

  const resetForAnotherRepo = () => {
    setRepoUrl("");
    setResult(null);
    setClaim(null);
    setInaccessibleRepo(false);
    setError(null);
    autoStartedRef.current = "";
    inFlightRef.current = false;
    if (initialRepoUrl.trim()) {
      router.replace("/audit");
    }
    window.requestAnimationFrame(() => {
      document.getElementById("public-audit-repo")?.focus();
    });
  };

  const breakdown = claim?.audit_breakdown;
  const score = claim?.production_score ?? 0;
  const badge = getProductionScoreBadge(score);
  const repoLabel = breakdown
    ? formatAuditedRepoLabel(breakdown.audited_repo_url)
    : "";
  const visibleRedFlags =
    result?.redFlags.filter(
      (item) => !result.scoreCap?.applied || !isFilesystemCapRedFlag(item)
    ) ?? [];
  const recommendations = result?.recommendations.slice(0, 3) ?? [];
  const strengths = result?.strengths ?? [];

  return (
    <div className="mx-auto w-full max-w-4xl space-y-8">
      <form onSubmit={onSubmit} className="w-full">
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-panel p-2 sm:flex-row sm:items-stretch">
          <label htmlFor="public-audit-repo" className="sr-only">
            GitHub Profile or Repo URL
          </label>
          <input
            id="public-audit-repo"
            name="repo"
            type="text"
            inputMode="url"
            autoComplete="url"
            spellCheck={false}
            value={repoUrl}
            onChange={(event) => setRepoUrl(event.target.value)}
            placeholder="Paste GitHub Profile or Repo URL"
            aria-invalid={Boolean(githubValidationMessage)}
            className="min-h-14 min-w-0 flex-1 rounded-xl border border-border bg-surface px-4 py-3.5 font-mono text-sm text-textMain placeholder:text-textMuted outline-none transition-colors duration-200 focus:border-brand sm:text-[15px]"
          />
          <button
            type="submit"
            disabled={loading || limitReached}
            className="inline-flex min-h-14 shrink-0 items-center justify-center rounded-xl border border-border bg-brand px-6 text-sm font-bold tracking-tight text-white transition-colors hover:bg-brandHover disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
          >
            {loading ? "Running Audit..." : "Run Production Audit"}
          </button>
        </div>
        {githubValidationMessage ? (
          <p role="alert" className="mt-3 text-left text-sm text-red-300">
            {githubValidationMessage}
          </p>
        ) : null}
      </form>

      {limitReached ? (
        <div
          role="status"
          className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-200"
        >
          {DAILY_LIMIT_UI_MESSAGE}
        </div>
      ) : null}

      {loading ? (
        <section className="rounded-2xl border border-border bg-panel p-6">
          <p className="text-sm font-bold text-textMain">Running production audit</p>
          <p className="mt-1 text-xs text-textMuted">
            Provix is inspecting CI/CD, test density, and error boundaries.
          </p>
          <ul className="mt-5 space-y-3">
            {AUDIT_STAGES.map((stage, index) => {
              const isComplete = index < stageIndex;
              const isActive = index === stageIndex;

              return (
                <li
                  key={stage}
                  className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 ${
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
 : "border-border text-zinc-600"
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
        </section>
      ) : null}

      {!loading && error ? (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      ) : null}

      {!loading && inaccessibleRepo ? (
        <PrivateRepositoryBanner
          variant="public"
          onTryAnotherRepo={resetForAnotherRepo}
        />
      ) : null}

      {!loading && result && claim && breakdown && !inaccessibleRepo ? (
        <div className="space-y-6">
          <section className="rounded-2xl border border-border bg-panel p-6">
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-emerald-400">
                  <ShieldCheck className="h-4 w-4" aria-hidden />
                  Production Audit Scorecard
                </p>
                <h2 className="mt-2 text-xl font-bold tracking-tight text-textMain">
                  Public repository score
                </h2>
              </div>
              <span
                className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold ${badge.className}`}
              >
                {badge.label}
              </span>
            </div>

            <div className="flex flex-wrap items-end gap-4">
              <p className="font-mono text-5xl font-extrabold tabular-nums text-textMain">
                {score}
                <span className="ml-1 text-lg font-semibold text-textMuted">
                  /100
                </span>
              </p>
              <div className="min-w-0 text-sm text-textMuted">
                {repoLabel ? (
                  <a
                    href={breakdown.audited_repo_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-textMain hover:text-textMain"
                  >
                    {repoLabel}
                  </a>
                ) : null}
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <SubMetric label="CI/CD" score={breakdown.ci_cd_score} />
              <SubMetric
                label="Test Assertion Density"
                score={breakdown.test_density}
              />
              <SubMetric
                label="Error Boundaries"
                score={breakdown.error_handling}
              />
            </div>
          </section>

          <ScorecardPublicationCallout claim={claim} />

          <section className="rounded-2xl border border-border bg-panel p-6">
            <h3 className="text-lg font-bold tracking-tight text-textMain">
              Findings
            </h3>
            <div className="mt-5 space-y-6">
              <FindingList
                title="Verified strengths"
                items={strengths}
                tone="pass"
              />
              <FindingList
                title="Gaps and missing proof-of-work"
                items={visibleRedFlags}
                tone="warn"
              />
              <FindingList
                title="Actionable fixes"
                items={recommendations}
                tone="fix"
              />
            </div>
          </section>

          <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <article className="flex h-full flex-col rounded-2xl border border-border bg-panel p-6">
              <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-background text-sky-400">
                <Code2 className="h-5 w-5" aria-hidden />
              </div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-sky-400">
                For the author
              </p>
              <h3 className="mt-3 text-lg font-bold tracking-tight text-textMain">
                Claim this scorecard and join the vetted developer roster
              </h3>
              <p className="mt-3 flex-1 text-sm leading-relaxed text-textMuted">
                Attach this production score to an anonymous candidate profile
                so hiring founders can see verified work, not resume claims.
              </p>
              <Link
                href={claimAuditLoginHref()}
                className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-brand text-white px-4 py-3 text-sm font-bold tracking-tight transition-colors duration-200 hover:bg-brandHover cursor-pointer"
              >
                Create Candidate Account
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </article>

            <article className="flex h-full flex-col rounded-2xl border border-border bg-panel p-6">
              <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-background text-brand">
                <Building2 className="h-5 w-5" aria-hidden />
              </div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-brand">
                For a hiring founder
              </p>
              <h3 className="mt-3 text-lg font-bold tracking-tight text-textMain">
                Want to hire builders with scorecards like this?
              </h3>
              <p className="mt-3 flex-1 text-sm leading-relaxed text-textMuted">
                Open the employer console to screen talent against verified
                GitHub artifacts and production audit scores.
              </p>
              <Link
                href={TALENT_HREF}
                className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-transparent px-4 py-3 text-sm font-bold tracking-tight text-white transition-colors duration-200 hover:bg-white/5 cursor-pointer"
              >
                Browse Vetted Talent
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </article>
          </section>
        </div>
      ) : null}

      {!loading && !result && !error && !inaccessibleRepo ? (
        <section className="rounded-2xl border border-border bg-panel px-6 py-12 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-background text-brand">
            <ShieldCheck className="h-7 w-7" aria-hidden />
          </div>
          <h2 className="text-base font-bold text-textMain">
            Audit results appear here
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-textMuted">
            Paste a public GitHub repository URL above to inspect code health
            and production readiness signals.
          </p>
        </section>
      ) : null}
    </div>
  );
}
