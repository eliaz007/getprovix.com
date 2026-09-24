"use client";

import ProductionScoreVerifiedBadge from "@/components/ProductionScoreVerifiedBadge";
import {
  type ProductionAuditMetrics,
  emptyProductionAuditMetrics,
} from "@/lib/production-audit-metrics";
import {
  formatCodebaseBenchmark,
  type CodebaseBenchmark,
} from "@/lib/codebase-benchmark";
import { clampScore0to100 } from "@/lib/score-scale";

const SECTION_LABEL =
  "text-[11px] font-semibold uppercase tracking-wider text-zinc-500";

const METRIC_ROWS: Array<{
  key: "architecture" | "testing" | "devops" | "resilience";
  label: string;
  shortLabel: string;
  microLabel: string;
  countKey:
    | "architecturePathCount"
    | "githubWorkflowCount"
    | "ciWorkflowCount"
    | "testFileCount"
    | "errorBoundaryCount"
    | "handlerCount";
}> = [
  {
    key: "architecture",
    label: "Architecture",
    shortLabel: "Arch",
    microLabel: "structure gaps",
    countKey: "architecturePathCount",
  },
  {
    key: "testing",
    label: "Testing",
    shortLabel: "Tests",
    microLabel: "missing suites",
    countKey: "testFileCount",
  },
  {
    key: "devops",
    label: "DevOps",
    shortLabel: "CI",
    microLabel: "missing workflows",
    countKey: "githubWorkflowCount",
  },
  {
    key: "resilience",
    label: "Resilience",
    shortLabel: "Resilience",
    microLabel: "unhandled errors",
    countKey: "handlerCount",
  },
];

function getMetricTone(score: number): string {
  if (score >= 80) {
    return "text-emerald-400";
  }
  if (score >= 60) {
    return "text-violet-400";
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
  /** Live rank against completed production audits. Hidden math stays off the compact card. */
  benchmark?: CodebaseBenchmark | null;
};

export default function ProductionScorecard({
  metrics,
  className = "",
  compact = true,
  benchmark = null,
}: ProductionScorecardProps) {
  const resolved = metrics ?? emptyProductionAuditMetrics();
  const productionScore = clampScore0to100(resolved.productionScore);
  const inspected = resolved.evidence.inspected;
  const weightSummary = `Weighted ${Math.round(resolved.weights.architecture * 100)}% architecture · ${Math.round(resolved.weights.testing * 100)}% tests · ${Math.round(resolved.weights.devops * 100)}% DevOps · ${Math.round(resolved.weights.resilience * 100)}% resilience.`;

  if (compact) {
    return (
      <div
        className={`rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-5 backdrop-blur-sm ${className}`.trim()}
      >
        <div className="min-w-0">
          <p className="mb-1 block text-xs uppercase tracking-wider text-muted-foreground text-zinc-500">
            Production Scorecard
          </p>
          <div className="flex items-center justify-between gap-3">
            <p
              className={`min-w-0 font-mono text-sm font-medium tabular-nums ${getMetricTone(
                productionScore
              )}`}
            >
              Codebase Quality Index: {productionScore}/100
            </p>
            <ProductionScoreVerifiedBadge score={productionScore} />
          </div>
          <p className="mt-1 text-sm leading-relaxed text-zinc-400">
            {inspected
              ? `Secondary codebase index · ${resolved.evidence.fileCount} paths`
              : "Run a GitHub audit to compute architecture, tests, CI, and resilience."}
          </p>
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
      className={`space-y-3 rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-6 backdrop-blur-sm ${className}`.trim()}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className={`${SECTION_LABEL} mb-1`}>Production Scorecard</div>
          <p className="text-sm font-semibold text-zinc-100">
            {formatCodebaseBenchmark(benchmark)}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-zinc-400">
            {inspected
              ? `Secondary sub-index from ${resolved.evidence.fileCount} inspected path${
                  resolved.evidence.fileCount === 1 ? "" : "s"
                }${
                  resolved.evidence.truncated ? " (truncated tree)" : ""
                }. ${weightSummary}`
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

      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {METRIC_ROWS.map((row) => {
          const score = clampScore0to100(resolved[row.key]);
          const found = metricCount(resolved, row.countKey);
          const issues = inspected ? metricIssueCount(score, found) : 0;
          const weight = resolved.weights[row.key];
          const weightPct = Math.round(weight * 100);
          const contribution = score * weight;

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
              <p className="mt-1 font-mono text-[11px] tabular-nums text-zinc-300">
                {score} × {weightPct}% = {contribution.toFixed(1)} pts
              </p>
              <p className="mt-1 text-sm text-zinc-400">
                {inspected ? `${issues} ${row.microLabel}` : "Not inspected"}
              </p>
            </li>
          );
        })}
      </ul>
      <p className="font-mono text-[11px] tabular-nums text-zinc-500">
        Weighted total {productionScore}/100 = round(architecture×35% + testing×25% +
        DevOps×20% + resilience×20%)
      </p>
    </div>
  );
}
