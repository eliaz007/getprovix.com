"use client";

import ScoreTrendChart from "@/components/dashboard/score-trend-chart";
import type { ProductionAuditRecord } from "@/lib/production-audit";
import { clampScore0to100 } from "@/lib/score-scale";

const GLASS_CARD =
  "bg-[#131316]/90 border border-white/[0.08] backdrop-blur-xl rounded-xl shadow-2xl p-6 sm:p-7";

function platformRankLabel(score: number): string {
  if (score >= 90) return "TOP 5% OF PLATFORM";
  if (score >= 80) return "TOP 8% OF PLATFORM";
  if (score >= 70) return "TOP 20% OF PLATFORM";
  if (score > 0) return "BUILDING MOMENTUM";
  return "AWAITING FIRST AUDIT";
}

function hygieneLabel(errorHandling: number): string {
  if (errorHandling >= 70) return "Clean";
  if (errorHandling >= 40) return "Partial";
  return "At Risk";
}

function cicdLabel(ciScore: number): string {
  if (ciScore >= 55) return "Automated";
  if (ciScore > 0) return "Partial";
  return "Missing";
}

function badgeTone(ok: boolean): string {
  return ok
    ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
    : "border-amber-500/25 bg-amber-500/10 text-amber-300";
}

export default function VerificationDossierPanel({
  scorecard,
  className = "",
}: {
  scorecard: ProductionAuditRecord | null;
  className?: string;
}) {
  const score = clampScore0to100(scorecard?.productionScore ?? 0);
  const hasScore = Boolean(scorecard?.isAuditVerified) || score > 0;
  const ci = clampScore0to100(scorecard?.breakdown.ci_cd_score ?? 0);
  const tests = clampScore0to100(scorecard?.breakdown.test_density ?? 0);
  const errors = clampScore0to100(scorecard?.breakdown.error_handling ?? 0);
  const hygiene = hygieneLabel(errors);
  const cicd = cicdLabel(ci);

  return (
    <section
      className={`${GLASS_CARD} flex h-full min-h-0 flex-col gap-5 ${className}`.trim()}
      aria-labelledby="verification-dossier-heading"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span
          id="verification-dossier-heading"
          className="inline-flex items-center rounded-md border border-white/[0.08] bg-[#070709] px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-400"
        >
          Verification Dossier
        </span>
        <span className="inline-flex items-center rounded-full border border-amber-500/25 bg-amber-500/10 px-2.5 py-1 font-mono text-[10px] font-semibold tracking-wide text-amber-300">
          {platformRankLabel(score)}
        </span>
      </div>

      <div className="flex items-baseline gap-1.5">
        <span className="font-mono text-5xl font-black tabular-nums tracking-tight text-zinc-50">
          {hasScore ? score : "—"}
        </span>
        <span className="font-mono text-sm font-medium text-zinc-500">
          / 100
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        <span
          className={`inline-flex items-center rounded-md border px-2 py-1 text-[11px] font-medium ${badgeTone(
            hygiene === "Clean"
          )}`}
        >
          Repo Hygiene: {hygiene}
        </span>
        <span
          className={`inline-flex items-center rounded-md border px-2 py-1 text-[11px] font-medium ${badgeTone(
            tests >= 60
          )}`}
        >
          Test Suite: {tests}% Coverage
        </span>
        <span
          className={`inline-flex items-center rounded-md border px-2 py-1 text-[11px] font-medium ${badgeTone(
            cicd === "Automated"
          )}`}
        >
          CI/CD: {cicd}
        </span>
      </div>

      <ScoreTrendChart
        variant="embedded"
        className="min-h-0 flex-1"
        repoUrl={scorecard?.breakdown.audited_repo_url}
        current={
          scorecard
            ? {
                score: scorecard.productionScore,
                auditedAt: scorecard.breakdown.audited_at,
                repoUrl: scorecard.breakdown.audited_repo_url,
              }
            : null
        }
      />
    </section>
  );
}
