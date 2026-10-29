"use client";
import ProductionScoreVerifiedBadge from "@/components/ProductionScoreVerifiedBadge";
import type { ExecutiveBrief, RecommendedRoleBand } from "@/lib/executive-brief";
import type { PillarSubLog } from "@/lib/forensic-dossier";
import {
  type ProductionAuditMetrics,
  emptyProductionAuditMetrics,
  resolveCodeHealthScore,
  weightedProductionScore,
} from "@/lib/production-audit-metrics";
import { formatCodebaseBenchmark, type CodebaseBenchmark } from "@/lib/codebase-benchmark";
import { clampScore0to100 } from "@/lib/score-scale";
import { SECTION_LABEL } from "./section-label";
import { METRIC_ROWS } from "./metric-rows";
import { getMetricTone } from "./getmetrictone";
import { metricCount } from "./metriccount";
import { metricIssueCount } from "./metricissuecount";
import { EngineeringBriefCards } from "./engineeringbriefcards";

export default function ProductionScorecard({
  metrics,
  className = "",
  compact = true,
  benchmark = null,
  executiveBrief = null,
  audience = "candidate",
  pillarSubLogs = null,
  historyVerifiedNote = null,
}: ProductionScorecardProps) {
  const resolved = metrics ?? emptyProductionAuditMetrics();
  const codeHealthScore = resolveCodeHealthScore(resolved);
  const productionScore = codeHealthScore;
  const inspected = resolved.evidence.inspected;
  const upstreamPenalty = Math.max(0, resolved.upstreamDerivativePenalty ?? 0);
  const subLogByPillar = new Map(
    (pillarSubLogs ?? []).map((log) => [log.pillar, log] as const)
  );
  const weightedTotal = weightedProductionScore({
    architecture: resolved.architecture,
    testing: resolved.testing,
    devops: resolved.devops,
    resilience: resolved.resilience,
  });

  if (compact) {
    return (
      <div
        className={`dossier-card rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-5 backdrop-blur-sm ${className}`.trim()}
      >
        <div className="min-w-0">
          <p className="mb-1 block text-xs uppercase tracking-wider text-muted-foreground text-zinc-500">
            Codebase Score
          </p>
          <div className="flex items-center justify-between gap-3">
            <p
              className={`min-w-0 font-mono text-sm font-medium tabular-nums ${getMetricTone(
                productionScore
              )}`}
            >
              Code Health: {codeHealthScore}/100
            </p>
            <ProductionScoreVerifiedBadge score={codeHealthScore} />
          </div>
          <p className="mt-1 text-sm leading-relaxed text-zinc-400">
            {inspected
              ? `Pillar index · ${resolved.evidence.fileCount} paths`
              : "Run a GitHub audit to compute architecture, tests, CI, and resilience."}
          </p>
          {upstreamPenalty > 0 ? (
            <p className="mt-1 font-mono text-[11px] tabular-nums text-zinc-500">
              Weighted total {weightedTotal}/100 − {upstreamPenalty} upstream fork
              or template = {productionScore}/100
            </p>
          ) : null}
          {executiveBrief ? (
            <EngineeringBriefCards
              brief={executiveBrief}
              audience={audience}
              historyVerifiedNote={historyVerifiedNote}
            />
          ) : null}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {METRIC_ROWS.map((row) => {
            const score = clampScore0to100(resolved[row.key]);
            const found = metricCount(resolved, row.countKey);
            const issues = inspected ? metricIssueCount(score, found) : 0;

            return (
              <div
                key={row.key}
                className="rounded-lg border border-zinc-800/80 bg-zinc-950/60 px-2.5 py-2.5 text-center"
              >
                <p
                  className={`font-mono text-sm font-bold tabular-nums ${getMetricTone(
                    score
                  )}`}
                >
                  {score}
                </p>
                <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-zinc-400">
                  {row.shortLabel}
                </p>
                {inspected ? (
                  <p className="mt-1 text-[11px] leading-snug text-zinc-500">
                    {issues} {row.microLabel}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`dossier-card space-y-4 rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-5 backdrop-blur-sm print:space-y-2 print:p-3 sm:p-6 ${className}`.trim()}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className={`${SECTION_LABEL} mb-1`}>Code Health · Pillars</div>
          <p className="text-sm font-semibold text-zinc-100">
            {formatCodebaseBenchmark(benchmark)}
          </p>
          {!inspected ? (
            <p className="mt-1 text-sm leading-relaxed text-zinc-400">
              Repository file tree was not inspected, so production metrics stay
              at 0.
            </p>
          ) : null}
        </div>
        <ProductionScoreVerifiedBadge score={codeHealthScore} />
      </div>

      {executiveBrief ? (
        <EngineeringBriefCards
          brief={executiveBrief}
          audience={audience}
          historyVerifiedNote={historyVerifiedNote}
        />
      ) : null}

      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 print:grid-cols-2 print:gap-2 lg:grid-cols-4">
        {METRIC_ROWS.map((row) => {
          const score = clampScore0to100(resolved[row.key]);
          const found = metricCount(resolved, row.countKey);
          const issues = inspected ? metricIssueCount(score, found) : 0;
          const subLog = subLogByPillar.get(row.key);

          return (
            <li
              key={row.key}
              className="dossier-card flex min-h-[8.5rem] flex-col rounded-lg border border-zinc-800/80 bg-zinc-950/60 px-4 py-4 print:min-h-0 print:px-3 print:py-3"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold tracking-tight text-zinc-100">
                  {row.label}
                </p>
                <span
                  className={`font-mono text-lg font-bold tabular-nums ${getMetricTone(
                    score
                  )}`}
                >
                  {score}
                </span>
              </div>
              <p className="mt-3 text-[13px] leading-snug text-zinc-400">
                {subLog?.summary ??
                  (inspected
                    ? `${issues} ${row.microLabel}`
                    : "Not inspected")}
              </p>
            </li>
          );
        })}
      </ul>
      {upstreamPenalty > 0 ? (
        <p className="font-mono text-[11px] tabular-nums text-zinc-500">
          Upstream fork or generated template −{upstreamPenalty} · Code Health{" "}
          {productionScore}/100 (weighted {weightedTotal}/100)
        </p>
      ) : null}
    </div>
  );
}
