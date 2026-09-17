"use client";

import ProductionScoreVerifiedBadge from "@/components/ProductionScoreVerifiedBadge";
import {
  type ProductionAuditMetrics,
  emptyProductionAuditMetrics,
} from "@/lib/production-audit-metrics";
import { clampScore0to100 } from "@/lib/score-scale";

const METRIC_ROWS: Array<{
  key: "ciCdHealth" | "testAssertionDensity" | "errorBoundaries";
  label: string;
  shortLabel: string;
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
    countKey: "githubWorkflowCount",
  },
  {
    key: "testAssertionDensity",
    label: "Tests",
    shortLabel: "Tests",
    countKey: "testFileCount",
  },
  {
    key: "errorBoundaries",
    label: "Errors",
    shortLabel: "Errors",
    countKey: "errorBoundaryCount",
  },
];

function getMetricTone(score: number): string {
  if (score >= 80) {
    return "text-emerald-300";
  }
  if (score >= 60) {
    return "text-amber-300";
  }
  if (score > 0) {
    return "text-orange-300";
  }
  return "text-red-300";
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
        className={`rounded-xl border border-border bg-panel px-3 py-2.5 ${className}`.trim()}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs uppercase font-bold tracking-wider text-zinc-400">
              Production scorecard
            </p>
            <p className="mt-0.5 truncate text-sm text-zinc-400">
              {inspected
                ? `${resolved.evidence.fileCount} paths · ${Math.round(
                    resolved.weights.ciCdHealth * 100
                  )}/${Math.round(
                    resolved.weights.testAssertionDensity * 100
                  )}/${Math.round(
                    resolved.weights.errorBoundaries * 100
                  )}% weights`
                : "Run a GitHub audit to compute CI, tests, and error boundaries."}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <div
              className={`font-mono text-lg font-bold tabular-nums ${getMetricTone(
                productionScore
              )}`}
            >
              {productionScore}
              <span className="text-sm font-semibold text-zinc-400">
                /100
              </span>
            </div>
            <ProductionScoreVerifiedBadge score={productionScore} />
          </div>
        </div>

        <div className="mt-2 grid grid-cols-3 gap-1.5">
          {METRIC_ROWS.map((row) => {
            const score = clampScore0to100(resolved[row.key]);
            const count = metricCount(resolved, row.countKey);

            return (
              <div
                key={row.key}
                className="rounded-lg border border-border/80 bg-background/60 px-2 py-1.5 text-center"
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
                  <p className="text-xs tabular-nums text-zinc-400">
                    {count}
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
      className={`rounded-xl border border-border bg-panel p-4 space-y-3 ${className}`.trim()}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase font-bold text-zinc-400 tracking-wider mb-1">
            Production audit scorecard
          </div>
          <p className="text-sm font-semibold text-textMain">
            File-tree production score
          </p>
          <p className="text-sm text-zinc-400 leading-relaxed mt-1">
            {inspected
              ? `Scored from ${resolved.evidence.fileCount} inspected path${
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
            className={`text-2xl font-mono font-bold tabular-nums ${getMetricTone(
              productionScore
            )}`}
          >
            {productionScore}
            <span className="text-sm font-semibold text-zinc-400">/100</span>
          </div>
          <ProductionScoreVerifiedBadge score={productionScore} />
          <div className="text-xs uppercase font-bold text-zinc-400 tracking-wider">
            Weighted total
          </div>
        </div>
      </div>

      <ul className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {METRIC_ROWS.map((row) => {
          const score = clampScore0to100(resolved[row.key]);
          const count = metricCount(resolved, row.countKey);

          return (
            <li
              key={row.key}
              className="rounded-lg border border-border px-3 py-2"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-textMain">{row.label}</p>
                <span
                  className={`text-sm font-mono font-bold tabular-nums ${getMetricTone(
                    score
                  )}`}
                >
                  {score}
                </span>
              </div>
              <p className="mt-1 text-sm text-zinc-400">
                {inspected ? `${count} found` : "Not inspected"}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
