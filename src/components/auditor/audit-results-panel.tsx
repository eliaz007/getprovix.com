import {
  AlertTriangle,
  Check,
  ChevronDown,
  X,
} from "lucide-react";
import type { AuditResult } from "@/app/api/audit/route";
import AuditChecksList from "@/components/auditor/audit-checks-list";
import ProductionScorecard from "@/components/auditor/production-scorecard";
import ScoreCapBreakdown from "@/components/auditor/score-cap-breakdown";
import ScoreMeter from "@/components/ScoreMeter";
import {
  resolveProductionAuditMetrics,
} from "@/lib/production-audit-metrics";
import {
  buildExecutiveChecklist,
  getReadinessBadge,
  type ChecklistTone,
} from "@/lib/audit-readiness";
import { isFilesystemCapRedFlag } from "@/lib/repo-filesystem";
import { clampScore0to100 } from "@/lib/score-scale";

const TONE_STYLES: Record<
  ChecklistTone,
  { iconWrap: string; status: string }
> = {
  pass: {
    iconWrap: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
    status: "text-emerald-300",
  },
  warn: {
    iconWrap: "border-amber-500/30 bg-amber-500/10 text-amber-400",
    status: "text-amber-300",
  },
  fail: {
    iconWrap: "border-rose-500/30 bg-rose-500/10 text-rose-400",
    status: "text-rose-300",
  },
};

function ChecklistIcon({ tone }: { tone: ChecklistTone }) {
  if (tone === "pass") {
    return <Check className="h-3.5 w-3.5" aria-hidden />;
  }
  if (tone === "warn") {
    return <AlertTriangle className="h-3.5 w-3.5" aria-hidden />;
  }
  return <X className="h-3.5 w-3.5" aria-hidden />;
}

function ProofPathList({
  title,
  paths,
}: {
  title: string;
  paths: string[];
}) {
  return (
    <div>
      <div className="text-[10px] uppercase font-bold text-textMuted tracking-wider mb-2">
        {title}
      </div>
      {paths.length > 0 ? (
        <ul className="space-y-1">
          {paths.map((path) => (
            <li
              key={path}
              className="font-mono text-[11px] text-textMuted leading-relaxed break-all"
            >
              {path}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[11px] text-textMuted">None recorded.</p>
      )}
    </div>
  );
}

export default function AuditResultsPanel({ result }: { result: AuditResult }) {
  const score = clampScore0to100(result.score);
  const badge = getReadinessBadge(score);
  const checklist = buildExecutiveChecklist({
    scoreCap: result.scoreCap,
    filesystem: result.filesystem,
    commitDates: result.commitDates,
  });
  const recommendations = (result.recommendations ?? []).slice(0, 3);
  const visibleRedFlags = (result.redFlags ?? []).filter(
    (item) => !result.scoreCap?.applied || !isFilesystemCapRedFlag(item)
  );
  const filesystem = result.filesystem;
  const metrics = resolveProductionAuditMetrics({
    metrics: result.metrics,
    filesystem,
  });

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-border bg-background p-4 sm:p-5 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="text-[10px] uppercase font-bold text-textMuted tracking-wider mb-1">
              Overall Readiness Score
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-3xl sm:text-4xl font-mono font-extrabold tabular-nums text-textMain">
                {score}
              </span>
              <span className="text-sm font-semibold text-textMuted">/100</span>
            </div>
          </div>
          <span
            className={`inline-flex w-fit max-w-full items-center rounded-full border px-3 py-1 text-[11px] sm:text-xs font-bold leading-tight ${badge.className}`}
          >
            {badge.label}
          </span>
        </div>

        <ScoreMeter score={score} className={badge.meterClassName} />

        <ProductionScorecard metrics={metrics} compact />

        <div>
          <div className="text-[10px] uppercase font-bold text-textMuted tracking-wider mb-3">
            Executive Checklist
          </div>
          <ul className="space-y-2">
            {checklist.map((item) => {
              const tone = TONE_STYLES[item.tone];
              return (
                <li
                  key={item.id}
                  className="flex items-center gap-3 rounded-xl border border-border bg-panel px-3 py-2.5"
                >
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${tone.iconWrap}`}
                    aria-hidden
                  >
                    <ChecklistIcon tone={item.tone} />
                  </span>
                  <span className="min-w-0 flex-1 text-sm font-semibold text-textMain leading-snug">
                    {item.label}
                  </span>
                  <span
                    className={`text-right text-[11px] sm:text-xs font-semibold leading-snug ${tone.status}`}
                  >
                    {item.status}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      <section>
        <div className="text-[10px] uppercase font-bold text-brand tracking-wider mb-3">
          Actionable Fixes
        </div>
        <ol className="space-y-2">
          {recommendations.map((item, index) => (
            <li
              key={item}
              className="flex items-start gap-3 rounded-xl border border-border bg-background px-3 py-2.5"
            >
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-brand/25 bg-brandGlow text-[11px] font-bold text-brand">
                {index + 1}
              </span>
              <span className="text-sm text-textMuted leading-relaxed">
                {item}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <details className="group rounded-2xl border border-border bg-background">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-textMain [&::-webkit-details-marker]:hidden">
          <span>View Technical File Proof & AST Logs</span>
          <ChevronDown
            className="h-4 w-4 shrink-0 text-textMuted transition-transform group-open:rotate-180"
            aria-hidden
          />
        </summary>
        <div className="space-y-5 border-t border-border px-4 py-4">
          <ScoreCapBreakdown
            scoreCap={result.scoreCap}
            score={result.score}
            filesystem={filesystem}
          />

          <AuditChecksList checks={result.checks} />

          <div className="space-y-4 rounded-xl border border-border bg-panel p-3">
            <div className="text-[10px] uppercase font-bold text-cyan-300 tracking-wider">
              Filesystem paths & AST evidence
            </div>
            <ProofPathList
              title="CI/CD workflow paths"
              paths={filesystem?.ci_workflow_paths ?? []}
            />
            <ProofPathList
              title="Test suite paths"
              paths={filesystem?.test_paths ?? []}
            />
            <ProofPathList
              title="Error-handling paths"
              paths={filesystem?.error_handling_paths ?? []}
            />
            <ProofPathList
              title="Inspected sample paths"
              paths={filesystem?.sample_paths ?? []}
            />
            {result.commitDates.length > 0 ? (
              <div>
                <div className="text-[10px] uppercase font-bold text-textMuted tracking-wider mb-2">
                  Sampled commit timestamps
                </div>
                <ul className="space-y-1">
                  {result.commitDates.map((date) => (
                    <li
                      key={date}
                      className="font-mono text-[11px] text-textMuted"
                    >
                      {date}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          {result.strengths.length > 0 ? (
            <div>
              <div className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider mb-3">
                Verified Strengths
              </div>
              <ul className="space-y-2">
                {result.strengths.map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-2 text-sm text-textMuted leading-relaxed"
                  >
                    <Check
                      className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5"
                      aria-hidden
                    />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {visibleRedFlags.length > 0 ? (
            <div>
              <div className="text-[10px] uppercase font-bold text-amber-400 tracking-wider mb-3">
                Detected Red Flags / Missing Proof-of-Work
              </div>
              <ul className="space-y-2">
                {visibleRedFlags.map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-2 text-sm text-textMuted leading-relaxed"
                  >
                    <AlertTriangle
                      className="w-4 h-4 text-amber-400 shrink-0 mt-0.5"
                      aria-hidden
                    />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </details>
    </div>
  );
}
