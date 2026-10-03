"use client";

import ProductionScoreVerifiedBadge from "@/components/ProductionScoreVerifiedBadge";
import type { ExecutiveBrief, RecommendedRoleBand } from "@/lib/executive-brief";
import {
  type ProductionAuditMetrics,
  emptyProductionAuditMetrics,
  weightedProductionScore,
} from "@/lib/production-audit-metrics";
import { formatCodebaseBenchmark, type CodebaseBenchmark } from "@/lib/codebase-benchmark";
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
  executiveBrief?: ExecutiveBrief | null;
  /** Employer dossiers lead with the founder brief. Candidate audits lead with the peer review. */
  audience?: "candidate" | "employer";
};

/** Split a 2–3 sentence brief into tight executive bullets. */
function briefBullets(summary: string): string[] {
  const cleaned = summary.replace(/\s+/g, " ").trim();
  if (!cleaned) {
    return [];
  }

  const chunks = cleaned
    .split(/\n+|(?:^|\s)[•]\s+|(?:^|\s)[-*]\s+/)
    .flatMap((chunk) =>
      chunk
        .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
        .map((sentence) => sentence.trim())
        .filter(Boolean)
    );

  return chunks.length > 0 ? chunks : [cleaned];
}

function BriefBulletList({ summary }: { summary: string }) {
  const bullets = briefBullets(summary);

  return (
    <ul className="mt-2 space-y-1 text-[12px] leading-snug text-zinc-200 print:mt-1 print:space-y-0.5 print:text-[10px] print:leading-tight">
      {bullets.map((item, index) => (
        <li
          key={`${index}-${item.slice(0, 32)}`}
          className="dossier-bullet flex items-start gap-1.5"
        >
          <span aria-hidden className="leading-snug">
            •
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function roleBandClass(band: RecommendedRoleBand): string {
  if (band === "Mid-Level") {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  }
  if (band === "Early-Stage Generalist") {
    return "border-violet-500/30 bg-violet-500/10 text-violet-200";
  }
  if (band === "Intern / Junior") {
    return "border-orange-500/30 bg-orange-500/10 text-orange-200";
  }
  return "border-rose-500/30 bg-rose-500/10 text-rose-200";
}

function EngineeringBriefCards({
  brief,
  audience,
}: {
  brief: ExecutiveBrief;
  audience: "candidate" | "employer";
}) {
  const staffReview = (
    <section className="rounded-lg border border-zinc-800/80 bg-zinc-950/70 px-3 py-3 print:px-2 print:py-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
          Technical Peer Review
        </p>
        <span className="text-xs px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
          FOR CANDIDATES
        </span>
      </div>
      <p className="mt-1 text-xs leading-snug text-zinc-500">
        Actionable engineering feedback to improve code health.
      </p>
      <BriefBulletList summary={brief.developerSummary} />
    </section>
  );
  const executiveBrief = (
    <section
      className={`rounded-lg border px-3 py-3 print:px-2 print:py-1.5 ${
        audience === "employer"
          ? "border-violet-500/30 bg-violet-500/10"
          : "border-zinc-800/80 bg-zinc-950/70"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
            Founder Hiring Verdict
          </p>
          <span className="text-xs px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
            FOR HIRING TEAMS
          </span>
        </div>
        <span
          className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold ${roleBandClass(
            brief.recommendedRoleBand
          )}`}
        >
          {brief.recommendedRoleBand}
        </span>
      </div>
      <p className="mt-1 text-xs leading-snug text-zinc-500">
        Production risk evaluation for founders and recruiters.
      </p>
      <BriefBulletList summary={brief.employerSummary} />
    </section>
  );

  return (
    <div className="mt-4 space-y-3">
      {audience === "employer" ? (
        <>
          {executiveBrief}
          {staffReview}
        </>
      ) : (
        <>
          {staffReview}
          {executiveBrief}
        </>
      )}
    </div>
  );
}

export default function ProductionScorecard({
  metrics,
  className = "",
  compact = true,
  benchmark = null,
  executiveBrief = null,
  audience = "candidate",
}: ProductionScorecardProps) {
  const resolved = metrics ?? emptyProductionAuditMetrics();
  const productionScore = clampScore0to100(resolved.productionScore);
  const inspected = resolved.evidence.inspected;
  const upstreamPenalty = Math.max(0, resolved.upstreamDerivativePenalty ?? 0);
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
              Codebase Quality Index: {productionScore}/100
            </p>
            <ProductionScoreVerifiedBadge score={productionScore} />
          </div>
          <p className="mt-1 text-sm leading-relaxed text-zinc-400">
            {inspected
              ? `Secondary codebase index · ${resolved.evidence.fileCount} paths`
              : "Run a GitHub audit to compute architecture, tests, CI, and resilience."}
          </p>
          {upstreamPenalty > 0 ? (
            <p className="mt-1 font-mono text-[11px] tabular-nums text-zinc-500">
              Weighted total {weightedTotal}/100 − {upstreamPenalty} upstream fork
              or template = {productionScore}/100
            </p>
          ) : null}
          {executiveBrief ? (
            <EngineeringBriefCards brief={executiveBrief} audience={audience} />
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
      className={`dossier-card space-y-3 rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-6 backdrop-blur-sm print:space-y-2 print:p-3 ${className}`.trim()}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className={`${SECTION_LABEL} mb-1`}>Codebase Score</div>
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
        <ProductionScoreVerifiedBadge score={productionScore} />
      </div>

      {executiveBrief ? (
        <EngineeringBriefCards brief={executiveBrief} audience={audience} />
      ) : null}

      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 print:grid-cols-4 print:gap-1.5 lg:grid-cols-4">
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
              className="dossier-card rounded-lg border border-zinc-800/80 bg-zinc-950/60 px-3 py-2.5 print:px-2 print:py-1.5"
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
        Weighted total {weightedTotal}/100 = round(architecture×35% + testing×25% +
        DevOps×20% + resilience×20%)
        {upstreamPenalty > 0
          ? ` · Upstream fork or generated template −${upstreamPenalty} · Headline ${productionScore}/100`
          : ""}
      </p>
    </div>
  );
}
