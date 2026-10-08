import type { AuditCheck } from "@/lib/audit-checks";
import {
  formatCodebaseBenchmark,
  type CodebaseBenchmark,
} from "@/lib/codebase-benchmark";
import type { ProductionAuditMetrics } from "@/lib/production-audit-metrics";
import type { RepoFilesystemEvidence } from "@/lib/repo-filesystem";
import { clampScore0to100 } from "@/lib/score-scale";
import {
  buildGitProvenance,
  buildHiringBattlePlanProbes,
  buildPillarSubLogs,
  buildSubsystemBlastRadius,
  type BlastRadiusRow,
  type GitProvenance,
  type PillarSubLog,
} from "@/lib/forensic-dossier";
import {
  synthesizeAuditInsights,
  type AuditScanData,
} from "@/lib/synthesize-audit-insights";

const PILLARS = [
  { key: "architecture", label: "Architecture" },
  { key: "devops", label: "DevOps" },
  { key: "resilience", label: "Resilience" },
  { key: "testing", label: "Testing" },
] as const;

type MemoInput = {
  handle: string;
  targetStack: string;
  verifiedOn: string;
  commitSha: string | null;
  branch?: string;
  score: number;
  benchmark: CodebaseBenchmark | null | undefined;
  metrics: ProductionAuditMetrics;
  filesystem: RepoFilesystemEvidence | null;
  checks: AuditCheck[];
  redFlags: string[];
  /** Screen-visible marketing preview. Default stays print-only. */
  showcase?: boolean;
  pillarSubLogs?: PillarSubLog[];
  blastRows?: BlastRadiusRow[];
  battlePlanProbes?: [string, string];
  provenance?: GitProvenance;
};

function shortPath(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts.slice(-3).join("/");
}

function percentileLabel(benchmark: CodebaseBenchmark | null | undefined): string {
  return formatCodebaseBenchmark(benchmark);
}

function shortSha(sha: string | null): string {
  if (!sha) {
    return "Not pinned";
  }
  return sha.slice(0, 12);
}

function toScanData(input: MemoInput): AuditScanData {
  const filesystem = input.filesystem;
  const inspected = filesystem?.inspected === true;
  const hasCi = (filesystem?.ci_workflow_paths.length ?? 0) > 0;
  const boundary = filesystem?.error_handling_paths[0] ?? null;
  const ciPath = filesystem?.ci_workflow_paths[0] ?? null;
  const testing = clampScore0to100(input.metrics.testing);
  const paths = [
    ...(filesystem?.sample_paths ?? []),
    ...(filesystem?.architecture_paths ?? []),
  ];
  const hasAppRouter = paths.some((path) =>
    /(^|\/)(src\/)?app\//i.test(path)
  );

  return {
    architecture: clampScore0to100(input.metrics.architecture),
    devops: clampScore0to100(input.metrics.devops),
    resilience: clampScore0to100(input.metrics.resilience),
    testing,
    testingScore: testing,
    boundaryFile: boundary ? shortPath(boundary) : null,
    ciPath: ciPath ? shortPath(ciPath) : null,
    testPathsCount:
      filesystem?.unit_test_file_count ?? filesystem?.test_paths.length ?? 0,
    unhandledAsyncCount: filesystem?.resilience_sampled
      ? filesystem.unhandled_async_count
      : null,
    totalFiles: filesystem?.file_count ?? 0,
    tsStrict: false,
    ciStatus: !inspected ? "" : hasCi ? "Active" : "Inactive",
    repoKind: filesystem?.repo_kind ?? null,
    hasAppRouter,
    hasBoundary: Boolean(boundary),
    hasCi,
  };
}

export default function TechnicalEvaluationMemo(input: MemoInput) {
  const insights = synthesizeAuditInsights(toScanData(input));
  const showcase = input.showcase === true;
  const provenance =
    input.provenance ?? buildGitProvenance(input.filesystem);
  const pillarSubLogs =
    input.pillarSubLogs ??
    buildPillarSubLogs({
      metrics: input.metrics,
      filesystem: input.filesystem,
    });
  const blastRows =
    input.blastRows ??
    buildSubsystemBlastRadius({
      metrics: input.metrics,
      filesystem: input.filesystem,
    });
  const battlePlanProbes =
    input.battlePlanProbes ??
    buildHiringBattlePlanProbes({
      metrics: input.metrics,
      filesystem: input.filesystem,
    });
  const subLogByPillar = new Map(
    pillarSubLogs.map((log) => [log.pillar, log] as const)
  );
  const branch = input.branch?.trim() || provenance.branch;

  return (
    <article
      id={showcase ? "sample-technical-evaluation-memo" : "technical-evaluation-memo"}
      className={
        showcase
          ? "memo-sheet flex bg-[#09090b] font-sans text-[#f4f4f5]"
          : "memo-sheet hidden bg-[#09090b] font-sans text-[#f4f4f5] print:flex!"
      }
    >
      <div
        className={
          showcase
            ? "mx-auto flex w-full flex-col gap-4 bg-[#09090b] p-5 sm:p-7"
            : "mx-auto flex h-full w-full max-w-5xl flex-col gap-4 bg-[#09090b] p-7"
        }
      >
        <header className="flex items-start justify-between gap-4 sm:gap-6">
          <div className="min-w-0">
            <p className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-[#a1a1aa]">
              Provix Technical Evaluation Dossier
            </p>
            <h1 className="mt-2 truncate text-[1.5rem] font-semibold leading-none tracking-tight text-[#f4f4f5] sm:text-[1.85rem]">
              {input.handle}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="memo-badge font-mono text-[11px]">
                Verified {input.verifiedOn}
              </span>
              <span className="memo-badge font-mono text-[11px]">
                {input.targetStack}
              </span>
              <span className="memo-badge font-mono text-[11px]">
                {branch}@{shortSha(input.commitSha)}
              </span>
              <span className="memo-badge font-mono text-[11px]">
                {provenance.inspectedFiles} files · ~
                {provenance.authoredLocEstimate.toLocaleString()} LOC est.
              </span>
              <span className="memo-badge font-mono text-[11px]">
                {provenance.astEngine}
              </span>
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <span className="memo-badge border-zinc-700 bg-zinc-800 px-3 py-1 font-mono text-sm text-zinc-100">
              {input.score}/100
            </span>
            <span className="memo-badge border-zinc-700 bg-zinc-800 px-3 py-1 font-mono text-[11px] text-zinc-100">
              {percentileLabel(input.benchmark)}
            </span>
          </div>
        </header>

        <section>
          <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-[#a1a1aa]">
            Architectural Signature &amp; Footprint
          </h2>
          <div
            className={
              showcase
                ? "memo-card mt-2 grid grid-cols-2 gap-px overflow-hidden bg-[#27272a] sm:grid-cols-4"
                : "memo-card mt-2 grid grid-cols-4 gap-px overflow-hidden bg-[#27272a]"
            }
          >
            {insights.footprint.map((cell) => (
              <div key={cell.label} className="bg-[#18181b] px-3 py-3">
                <p className="font-mono text-[10px] font-medium uppercase tracking-wider text-[#a1a1aa]">
                  {cell.label}
                </p>
                <p className="mt-1 text-[12px] leading-5 text-[#f4f4f5]">
                  {cell.value}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-[#a1a1aa]">
            Pillar Scorecard — Forensic Receipts
          </h2>
          <div
            className={
              showcase
                ? "mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2"
                : "mt-2 grid grid-cols-2 gap-3"
            }
          >
            {PILLARS.map((pillar) => {
              const log = subLogByPillar.get(pillar.key);
              return (
                <div key={pillar.key} className="memo-card px-3 py-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-mono text-[10px] font-medium uppercase tracking-wider text-[#a1a1aa]">
                      {pillar.label}
                    </p>
                    <p className="font-mono text-2xl font-semibold leading-none tabular-nums text-[#f4f4f5]">
                      {clampScore0to100(input.metrics[pillar.key])}
                    </p>
                  </div>
                  {log ? (
                    <p className="mt-3 text-[12px] leading-5 text-[#a1a1aa]">
                      {log.summary}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>

        <section className="memo-card border-[#3f3f46] px-5 py-4">
          <p className="text-sm font-medium leading-6 text-[#f4f4f5]">
            {insights.verdict}
          </p>
        </section>

        <section>
          <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-[#a1a1aa]">
            Codebase Breakdown
          </h2>
          <div className="memo-card mt-2 overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-left text-[11px]">
              <thead>
                <tr className="border-b border-[#27272a] font-mono text-[10px] uppercase tracking-wider text-[#a1a1aa]">
                  <th className="px-3 py-2 font-medium">Area</th>
                  <th className="px-3 py-2 font-medium">Can They Own This?</th>
                  <th className="px-3 py-2 font-medium">Risk</th>
                  <th className="px-3 py-2 font-medium">What We Found</th>
                </tr>
              </thead>
              <tbody>
                {blastRows.map((row) => (
                  <tr
                    key={row.subsystem}
                    className="border-b border-[#27272a] last:border-0"
                  >
                    <td className="px-3 py-2 font-mono font-semibold text-[#f4f4f5]">
                      {row.subsystem}
                    </td>
                    <td className="px-3 py-2 text-[#d4d4d8]">
                      {row.evaluatedSeniority}
                    </td>
                    <td className="px-3 py-2 font-mono text-[#f4f4f5]">
                      {row.riskLevel}
                    </td>
                    <td className="px-3 py-2 text-[#a1a1aa]">
                      {row.forensicFinding}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section
          className={
            showcase
              ? "flex flex-col"
              : "memo-fill flex min-h-0 flex-1 flex-col"
          }
        >
          <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-[#a1a1aa]">
            Operational Execution Matrix
          </h2>
          <div
            className={
              showcase
                ? "mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2"
                : "mt-2 grid min-h-0 flex-1 grid-cols-2 gap-3"
            }
          >
            <div className="memo-card flex flex-col px-4 py-4">
              <h3 className="font-mono text-[10px] font-medium uppercase tracking-wider text-[#a1a1aa]">
                What They Can Ship Autonomously
              </h3>
              <p className="mt-1 text-[11px] font-medium text-[#f4f4f5]">
                Day 1 Strengths
              </p>
              <ul className="mt-3 space-y-3">
                {insights.strengths.map((item) => (
                  <li key={item} className="text-[12px] leading-5 text-[#f4f4f5]">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="memo-card flex flex-col px-4 py-4">
              <h3 className="font-mono text-[10px] font-medium uppercase tracking-wider text-[#a1a1aa]">
                Operational Liabilities &amp; Blindspots
              </h3>
              <p className="mt-1 text-[11px] font-medium text-[#f4f4f5]">
                Requires Senior Oversight
              </p>
              <ul className="mt-3 space-y-3">
                {insights.risks.map((item) => (
                  <li key={item} className="text-[12px] leading-5 text-[#f4f4f5]">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className="memo-card px-4 py-4">
          <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-[#a1a1aa]">
            Hiring Team Interview Battle Plan
          </h2>
          <ol className="mt-3 list-none space-y-2.5">
            {battlePlanProbes.map((question, index) => (
              <li key={question} className="flex items-start gap-3">
                <span className="memo-badge mt-0.5 shrink-0 border-zinc-700 bg-zinc-800 font-mono text-[10px] text-zinc-100">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1 text-[12px] leading-5 text-[#f4f4f5]">
                  {question}
                </span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </article>
  );
}
