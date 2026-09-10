"use client";

import ScoreMeter from "@/components/ScoreMeter";
import {
  type ProductionAuditMetrics,
  emptyProductionAuditMetrics,
} from "@/lib/production-audit-metrics";
import { clampScore0to100 } from "@/lib/score-scale";

const METRIC_ROWS: Array<{
  key: "ciCdHealth" | "testAssertionDensity" | "errorBoundaries";
  label: string;
  hint: string;
  weightKey: "ciCdHealth" | "testAssertionDensity" | "errorBoundaries";
  countKey:
    | "githubWorkflowCount"
    | "ciWorkflowCount"
    | "testFileCount"
    | "errorBoundaryCount";
  countLabel: string;
}> = [
  {
    key: "ciCdHealth",
    label: "CI/CD Health",
    hint: ".github/workflows and other CI configs",
    weightKey: "ciCdHealth",
    countKey: "githubWorkflowCount",
    countLabel: "workflow files",
  },
  {
    key: "testAssertionDensity",
    label: "Test Assertion Density",
    hint: "test/, spec/, and *.test.* paths in the tree",
    weightKey: "testAssertionDensity",
    countKey: "testFileCount",
    countLabel: "test artifacts",
  },
  {
    key: "errorBoundaries",
    label: "Error Boundaries",
    hint: "error.tsx and ErrorBoundary modules",
    weightKey: "errorBoundaries",
    countKey: "errorBoundaryCount",
    countLabel: "boundary files",
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
};

export default function ProductionScorecard({
  metrics,
  className = "",
}: ProductionScorecardProps) {
  const resolved = metrics ?? emptyProductionAuditMetrics();
  const productionScore = clampScore0to100(resolved.productionScore);

  return (
    <div
      className={`rounded-xl border border-zinc-800 bg-[#0A0A0A] p-4 space-y-4 ${className}`.trim()}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-1">
            Production audit scorecard
          </div>
          <p className="text-sm font-semibold text-white">
            File-tree production score
          </p>
          <p className="text-[11px] text-slate-400 leading-relaxed mt-1">
            {resolved.evidence.inspected
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
        <div className="text-right shrink-0">
          <div
            className={`text-2xl font-mono font-bold tabular-nums ${getMetricTone(
              productionScore
            )}`}
          >
            {productionScore}
            <span className="text-sm font-semibold text-slate-500">/100</span>
          </div>
          <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider mt-0.5">
            Weighted total
          </div>
        </div>
      </div>

      <ScoreMeter
        score={productionScore}
        className={`${getMetricTone(productionScore)} max-w-full`}
      />

      <ul className="space-y-3">
        {METRIC_ROWS.map((row) => {
          const score = clampScore0to100(resolved[row.key]);
          const count = metricCount(resolved, row.countKey);
          const weightPct = Math.round(resolved.weights[row.weightKey] * 100);

          return (
            <li key={row.key} className="space-y-1.5">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-semibold text-white truncate">
                      {row.label}
                    </p>
                    <span className="text-[10px] font-mono text-slate-500 shrink-0">
                      {weightPct}%
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 truncate">
                    {resolved.evidence.inspected
                      ? `${count} ${
                          count === 1
                            ? row.countLabel.replace(/s$/, "")
                            : row.countLabel
                        } · ${row.hint}`
                      : row.hint}
                  </p>
                </div>
                <span
                  className={`text-sm font-mono font-bold tabular-nums shrink-0 ${getMetricTone(
                    score
                  )}`}
                >
                  {score}
                </span>
              </div>
              <ScoreMeter score={score} className={getMetricTone(score)} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
