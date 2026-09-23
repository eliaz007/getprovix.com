"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Check,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import type { AuditResult } from "@/app/api/audit/route";
import { normalizeAuditChecks } from "@/lib/audit-checks";
import { DAILY_LIMIT_UI_MESSAGE, type DailyScanUsage } from "@/lib/daily-scan-limit";
import { readJsonResponse } from "@/lib/read-json-response";
import {
  buildProductionAuditClaim,
  clearPendingProductionAudit,
  formatAuditedRepoLabel,
  PRIVATE_AUDIT_INTENT,
  type ProductionAuditClaim,
} from "@/lib/production-audit";
import TalentNetworkCta from "@/components/auditor/talent-network-cta";
import PrivateRepositoryBanner from "@/components/auditor/private-repository-banner";
import RepoOwnershipVerifier from "@/components/auditor/repo-ownership-verifier";
import ProductionScoreVerifiedBadge from "@/components/ProductionScoreVerifiedBadge";
import GuestAuthModal from "@/components/GuestAuthModal";
import { isFilesystemCapRedFlag } from "@/lib/repo-filesystem";
import {
  INACCESSIBLE_PUBLIC_REPO_MESSAGE,
  isInaccessiblePublicAudit,
  isPrivateOrNotFoundAuditResponse,
} from "@/lib/inaccessible-public-audit";
import Toast from "@/components/Toast";
import {
  getGitHubUrlValidationMessage,
  hasUsableGitHubAuditTarget,
  parseGitHubUrl,
} from "@/lib/validate-github-url";
import { createClient } from "@/utils/supabase/client";

const AUDIT_STAGES = [
  "Artifact Analysis (Check 1)...",
  "Architecture Review (Check 2)...",
  "API & Data Resiliency Check (Check 3)...",
] as const;

function SubMetric({ label, score }: { label: string; score: number }) {
  return (
    <div className="rounded-lg border border-border bg-background px-2.5 py-2 text-center">
      <p className="font-mono text-sm font-bold tabular-nums text-textMain">
        {score}
      </p>
      <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-textMuted">
        {label}
      </p>
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
        ? "text-violet-400"
        : "text-neutral-400";

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
  embedded = false,
  showEmptyState = true,
  onHasResultsChange,
}: {
  initialRepoUrl?: string;
  /** Keep results on this page instead of navigating to `/audit`. */
  embedded?: boolean;
  showEmptyState?: boolean;
  onHasResultsChange?: (hasResults: boolean) => void;
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
  const [inaccessibleWarning, setInaccessibleWarning] = useState<string | null>(
    null
  );
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [limitReached, setLimitReached] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalError, setAuthModalError] = useState<string | null>(null);
  const [authModalDescription, setAuthModalDescription] = useState(
    "Sign in or create an account to continue."
  );
  const [authNextPath, setAuthNextPath] = useState("/dashboard");
  const [authIntent, setAuthIntent] = useState(PRIVATE_AUDIT_INTENT);
  const stageIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoStartedRef = useRef("");
  const inFlightRef = useRef(false);

  const openAuthModal = (options: {
    description: string;
    nextPath: string;
    intent?: string;
  }) => {
    setAuthModalError(null);
    setAuthModalDescription(options.description);
    setAuthNextPath(options.nextPath);
    setAuthIntent(options.intent ?? PRIVATE_AUDIT_INTENT);
    setAuthModalOpen(true);
  };

  const hasValidGithubInput = hasUsableGitHubAuditTarget(repoUrl);
  const parsedGithub = parseGitHubUrl(repoUrl);
  const ownershipRepoUrl =
    parsedGithub?.repo != null
      ? `https://github.com/${parsedGithub.owner}/${parsedGithub.repo}`
      : "";
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
    setInaccessibleWarning(null);
    setToastMessage(null);
    startStageProgress();

    try {
      const response = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          githubUrl: trimmed,
          compensationLevel: "Mid",
          playground: true,
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
        data = (await readJsonResponse(response)) as typeof data;
      } catch {
        if (
          response.status === 401 ||
          response.status === 403 ||
          response.status === 404
        ) {
          setInaccessibleRepo(true);
          setInaccessibleWarning(INACCESSIBLE_PUBLIC_REPO_MESSAGE);
          setToastMessage(INACCESSIBLE_PUBLIC_REPO_MESSAGE);
          setResult(null);
          setClaim(null);
          openAuthModal({
            description: INACCESSIBLE_PUBLIC_REPO_MESSAGE,
            nextPath: `/dashboard?intent=${PRIVATE_AUDIT_INTENT}`,
            intent: PRIVATE_AUDIT_INTENT,
          });
          return;
        }
        throw new Error("Audit request failed.");
      }

      if (
        isPrivateOrNotFoundAuditResponse(data) ||
        isInaccessiblePublicAudit({ status: response.status, result: data })
      ) {
        setLimitReached(Boolean(data.limit_reached));
        const warning =
          data.error?.trim() || INACCESSIBLE_PUBLIC_REPO_MESSAGE;
        setInaccessibleRepo(true);
        setInaccessibleWarning(warning);
        setToastMessage(warning);
        setResult(null);
        setClaim(null);
        try {
          const supabase = createClient();
          const { data: sessionData } = await supabase.auth.getUser();
          if (!sessionData.user) {
            openAuthModal({
              description: warning,
              nextPath: `/dashboard?intent=${PRIVATE_AUDIT_INTENT}`,
              intent: PRIVATE_AUDIT_INTENT,
            });
          }
        } catch {
          openAuthModal({
            description: warning,
            nextPath: `/dashboard?intent=${PRIVATE_AUDIT_INTENT}`,
            intent: PRIVATE_AUDIT_INTENT,
          });
        }
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
      clearPendingProductionAudit();
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
        const data = (await readJsonResponse(response)) as DailyScanUsage;
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
    void runAudit(trimmed);
    if (!embedded && trimmed) {
      router.replace(`/audit?repo=${encodeURIComponent(trimmed)}`, {
        scroll: false,
      });
    }
  };

  const resetForAnotherRepo = () => {
    setRepoUrl("");
    setResult(null);
    setClaim(null);
    setInaccessibleRepo(false);
    setInaccessibleWarning(null);
    setToastMessage(null);
    setError(null);
    autoStartedRef.current = "";
    inFlightRef.current = false;
    if (!embedded && initialRepoUrl.trim()) {
      router.replace("/audit");
    }
    window.requestAnimationFrame(() => {
      document.getElementById("public-audit-repo")?.focus();
    });
  };

  const requireAuthForPrivateRepo = () => {
    openAuthModal({
      description: INACCESSIBLE_PUBLIC_REPO_MESSAGE,
      nextPath: `/dashboard?intent=${PRIVATE_AUDIT_INTENT}`,
      intent: PRIVATE_AUDIT_INTENT,
    });
  };

  const breakdown = claim?.audit_breakdown;
  const score = claim?.production_score ?? 0;
  const repoLabel = breakdown
    ? formatAuditedRepoLabel(breakdown.audited_repo_url)
    : "";
  const visibleRedFlags = (result?.redFlags ?? []).filter(
    (item) => !result?.scoreCap?.applied || !isFilesystemCapRedFlag(item)
  );
  const recommendations = (result?.recommendations ?? []).slice(0, 3);
  const strengths = result?.strengths ?? [];
  const hasResults = Boolean(
    !loading && result && claim && breakdown && !inaccessibleRepo
  );

  useEffect(() => {
    onHasResultsChange?.(hasResults);
  }, [hasResults, onHasResultsChange]);

  useEffect(() => {
    if (!toastMessage) {
      return;
    }
    const timer = window.setTimeout(() => setToastMessage(null), 6000);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-8">
      <form onSubmit={onSubmit} className="w-full">
        <div className="relative flex flex-col gap-2 overflow-hidden rounded-xl border border-neutral-800/80 bg-[#0d0f17] p-1.5 transition-colors hover:border-neutral-700/80 sm:flex-row sm:items-stretch">
          <div className="pointer-events-none absolute -right-16 -top-16 h-32 w-32 rounded-full bg-violet-600/5 blur-2xl" />
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
            className="relative min-h-12 min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-4 py-3 font-mono text-sm text-white placeholder:text-neutral-500 outline-none transition-colors duration-200 focus:border-cyan-500/20 sm:text-[15px]"
          />
          <button
            type="submit"
            disabled={loading || limitReached}
            className="relative inline-flex min-h-12 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-violet-600 px-5 text-sm font-medium tracking-tight text-white shadow-[0_0_20px_rgba(124,58,237,0.25)] transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Running Audit..." : "Run Production Audit"}
          </button>
        </div>
        {githubValidationMessage ? (
          <p role="alert" className="mt-3 text-left text-sm text-red-300">
            {githubValidationMessage}
          </p>
        ) : null}
        {inaccessibleWarning ? (
          <PrivateRepositoryBanner
            variant="inline"
            message={inaccessibleWarning}
          />
        ) : null}
      </form>

      {!embedded && ownershipRepoUrl ? (
        <RepoOwnershipVerifier repoUrl={ownershipRepoUrl} />
      ) : null}

      {limitReached ? (
        <div
          role="status"
          className="rounded-xl border border-violet-500/25 bg-violet-500/10 px-4 py-3 text-sm text-violet-200"
        >
          {DAILY_LIMIT_UI_MESSAGE}
        </div>
      ) : null}

      {loading ? (
        <section className="rounded-2xl border border-neutral-800/80 bg-[#0d0f17] p-6">
          <p className="text-sm font-bold text-textMain">Running production audit</p>
          <p className="mt-1 text-xs text-textMuted">
            Provix is inspecting architecture, tests, CI, and resilience.
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
 ? "border-emerald-500/20 bg-emerald-500/10"
 : isActive
 ? "border-neutral-700 bg-neutral-900"
 : "border-neutral-800 bg-transparent"
 }`}
                >
                  <span
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold ${
 isComplete
 ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
 : isActive
 ? "border-neutral-600 text-white"
 : "border-neutral-800 text-neutral-600"
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
 ? "text-emerald-400"
 : isActive
 ? "text-neutral-200"
 : "text-neutral-500"
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
          message={inaccessibleWarning ?? INACCESSIBLE_PUBLIC_REPO_MESSAGE}
          onTryAnotherRepo={resetForAnotherRepo}
          onRequireAuth={requireAuthForPrivateRepo}
        />
      ) : null}

      {!loading && result && claim && breakdown && !inaccessibleRepo ? (
        <div className="space-y-4 text-left">
          <section className="rounded-xl border border-neutral-800/80 bg-[#0d0f17] p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
                Production Audit
              </p>
              <ProductionScoreVerifiedBadge score={score} />
            </div>

            <div className="mt-3 flex flex-wrap items-end gap-3">
              <p className="font-mono text-3xl font-extrabold tabular-nums text-textMain">
                {score}
                <span className="ml-1 text-xs font-semibold text-textMuted">
                  /100
                </span>
              </p>
              <div className="min-w-0 pb-0.5 text-xs text-textMuted">
                {repoLabel ? (
                  <a
                    href={breakdown.audited_repo_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-textMain hover:underline"
                  >
                    {repoLabel}
                  </a>
                ) : null}
              </div>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2">
              <SubMetric label="CI/CD" score={breakdown.ci_cd_score} />
              <SubMetric label="Tests" score={breakdown.test_density} />
              <SubMetric label="Errors" score={breakdown.error_handling} />
            </div>
          </section>

          <section className="rounded-xl border border-neutral-800/80 bg-[#0d0f17] p-4">
            <h3 className="text-sm font-bold tracking-tight text-textMain">
              Findings
            </h3>
            <div className="mt-3 space-y-4">
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

          <TalentNetworkCta />
        </div>
      ) : null}

      {showEmptyState &&
      !loading &&
      !result &&
      !error &&
      !inaccessibleRepo ? (
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

      <GuestAuthModal
        open={authModalOpen}
        error={authModalError}
        onClose={() => setAuthModalOpen(false)}
        onError={setAuthModalError}
        description={authModalDescription}
        nextPath={authNextPath}
        loginHref={`/login?intent=${encodeURIComponent(authIntent)}&next=${encodeURIComponent(authNextPath)}`}
      />

      <Toast message={toastMessage} variant="error" />
    </div>
  );
}
