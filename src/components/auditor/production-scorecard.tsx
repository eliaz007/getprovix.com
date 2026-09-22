"use client";

import ProductionScoreVerifiedBadge from "@/components/ProductionScoreVerifiedBadge";
import {
  type ProductionAuditMetrics,
  emptyProductionAuditMetrics,
} from "@/lib/production-audit-metrics";
import { clampScore0to100 } from "@/lib/score-scale";

const SECTION_LABEL =
  "text-[11px] font-semibold uppercase tracking-wider text-zinc-500";

const METRIC_ROWS: Array<{
  key: "ciCdHealth" | "testAssertionDensity" | "errorBoundaries";
  label: string;
  shortLabel: string;
  microLabel: string;
  countKey:
    | "githubWorkflowCount"
    | "ciWorkflowCount"
    | "testFileCount"
    | "errorBoundaryCount";
}> = [
  {
    key: "ciCdHealth",
    label: "CI/CD",
    shortLabel: "CI",
    microLabel: "failing checks",
    countKey: "githubWorkflowCount",
  },
  {
    key: "testAssertionDensity",
    label: "Tests",
    shortLabel: "Tests",
    microLabel: "flaky tests",
    countKey: "testFileCount",
  },
  {
    key: "errorBoundaries",
    label: "Errors",
    shortLabel: "Errors",
    microLabel: "unhandled exceptions",
    countKey: "errorBoundaryCount",
  },
];

function getMetricTone(score: number): string {
  if (score >= 80) {
    return "text-emerald-400";
  }
  if (score >= 60) {
    return "text-amber-400";
  }
  if (score > 0) {
    return "text-orange-300";
  }
  return "text-red-400";
}

function metricCount(
  metrics: ProductionAuditMetrics,
  countKey: (typeof METRIC_ROWS)[number]["countKey"]
): number {
  if (countKey === "githubWorkflowCount") {
    return (
      metrics.evidence.githubWorkflowCount || metrics.evidence.ciWorkflowCount
    );
  }
  return metrics.evidence[countKey];
}

/** Inverse signal for micro-copy: presence score high → 0 failing/flaky/unhandled. */
function metricIssueCount(score: number, foundCount: number): number {
  if (!foundCount) {
    return score > 0 ? 0 : 1;
  }
  return score >= 60 ? 0 : Math.max(1, Math.min(foundCount, 3));
}

type ProductionScorecardProps = {
  metrics?: ProductionAuditMetrics | null;
  className?: string;
  /** Dense single-row layout for profile settings / tight result panels. */
  compact?: boolean;
};

export default function ProductionScorecard({
  metrics,
  className = "",
  compact = true,
}: ProductionScorecardProps) {
  const resolved = metrics ?? emptyProductionAuditMetrics();
  const productionScore = clampScore0to100(resolved.productionScore);
  const inspected = resolved.evidence.inspected;

  if (compact) {
    return (
      <div
        className={`rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-5 backdrop-blur-sm ${className}`.trim()}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className={SECTION_LABEL}>Production Scorecard</p>
            <p className="mt-1 truncate text-sm text-zinc-400">
              {inspected
                ? `Secondary codebase index · ${resolved.evidence.fileCount} paths`
                : "Run a GitHub audit to compute CI, tests, and error boundaries."}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <p
              className={`text-right font-mono text-sm font-medium tabular-nums ${getMetricTone(
                productionScore
              )}`}
            >
              Codebase Quality Index: {productionScore}/100
            </p>
            <ProductionScoreVerifiedBadge score={productionScore} />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
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
      className={`space-y-3 rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-6 backdrop-blur-sm ${className}`.trim()}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className={`${SECTION_LABEL} mb-1`}>Production Scorecard</div>
          <p className="text-sm font-semibold text-zinc-100">
            Codebase Quality Index
          </p>
          <p className="mt-1 text-sm leading-relaxed text-zinc-400">
            {inspected
              ? `Secondary sub-index from ${resolved.evidence.fileCount} inspected path${
                  resolved.evidence.fileCount === 1 ? "" : "s"
                }${
                  resolved.evidence.truncated ? " (truncated tree)" : ""
                }. Weighted ${Math.round(resolved.weights.ciCdHealth * 100)}% CI/CD · ${Math.round(
                  resolved.weights.testAssertionDensity * 100
                )}% tests · ${Math.round(resolved.weights.errorBoundaries * 100)}% error boundaries.`
              : "Repository file tree was not inspected, so production metrics stay at 0."}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5 text-right">
          <div
            className={`font-mono text-2xl font-bold tabular-nums ${getMetricTone(
              productionScore
            )}`}
          >
            {productionScore}
            <span className="text-sm font-semibold text-zinc-400">/100</span>
          </div>
          <ProductionScoreVerifiedBadge score={productionScore} />
          <div className={SECTION_LABEL}>Secondary index</div>
        </div>
      </div>

      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {METRIC_ROWS.map((row) => {
          const score = clampScore0to100(resolved[row.key]);
          const found = metricCount(resolved, row.countKey);
          const issues = inspected ? metricIssueCount(score, found) : 0;

          return (
            <li
              key={row.key}
              className="rounded-lg border border-zinc-800/80 bg-zinc-950/60 px-3 py-2.5"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-zinc-100">{row.label}</p>
                <span
                  className={`font-mono text-sm font-bold tabular-nums ${getMetricTone(
                    score
                  )}`}
                >
                  {score}
                </span>
              </div>
              <p className="mt-1 text-sm text-zinc-400">
                {inspected ? `${issues} ${row.microLabel}` : "Not inspected"}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
