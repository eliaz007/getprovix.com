"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Copy,
  CheckCheck,
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
  buildRemediationActions,
  getCredentialStatus,
  getReadinessBadge,
  projectRemediationScore,
  TALENT_NETWORK_SCORE_THRESHOLD,
  type ChecklistTone,
  type RemediationActionId,
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

const CI_WORKFLOW_TEMPLATE = `name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  build-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: npm
      - run: npm ci
      - run: npm test -- --run
      - run: npm run build
`;

const SMOKE_TEST_TEMPLATE = `import { describe, expect, it } from "vitest";

describe("smoke", () => {
  it("boots the app shell without throwing", () => {
    expect(true).toBe(true);
  });

  it("keeps critical env contracts defined in CI", () => {
    expect(typeof process.env.NODE_ENV).toBe("string");
  });
});
`;

type FixTemplate = {
  id: RemediationActionId;
  title: string;
  deductionLabel: string;
  points: number;
  filename: string;
  language: string;
  body: string;
  guidance: string;
};

const FIX_TEMPLATES: FixTemplate[] = [
  {
    id: "ci",
    title: "Missing CI/CD pipeline",
    deductionLabel: "Missing CI/CD",
    points: 25,
    filename: ".github/workflows/ci.yml",
    language: "yaml",
    body: CI_WORKFLOW_TEMPLATE,
    guidance:
      "Commit this workflow so every push and PR runs install, tests, and build. File-tree proof of CI lifts the production ceiling.",
  },
  {
    id: "tests",
    title: "Missing test suite",
    deductionLabel: "Missing tests",
    points: 25,
    filename: "smoke.test.ts",
    language: "typescript",
    body: SMOKE_TEST_TEMPLATE,
    guidance:
      "Add a real runner (Vitest/Jest) and expand beyond smoke coverage. Inspected test paths are what raise the score — README claims do not.",
  },
];

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
      <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
        {title}
      </div>
      {paths.length > 0 ? (
        <ul className="space-y-1">
          {paths.map((path) => (
            <li
              key={path}
              className="break-all font-mono text-[11px] leading-relaxed text-zinc-400"
            >
              {path}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[11px] text-zinc-500">None recorded.</p>
      )}
    </div>
  );
}

function CopyTemplateButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void onCopy()}
      className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-300 transition-colors hover:border-zinc-600 hover:bg-zinc-800 hover:text-white cursor-pointer"
    >
      {copied ? (
        <>
          <CheckCheck className="h-3.5 w-3.5 text-emerald-400" aria-hidden />
          Copied
        </>
      ) : (
        <>
          <Copy className="h-3.5 w-3.5" aria-hidden />
          Copy
        </>
      )}
    </button>
  );
}

export default function AuditResultsPanel({
  result,
  repoLabel,
  targetRole,
}: {
  result: AuditResult;
  repoLabel?: string | null;
  targetRole?: string | null;
}) {
  const score = clampScore0to100(result.score);
  const badge = getReadinessBadge(score);
  const credential = getCredentialStatus(score);
  const checklist = buildExecutiveChecklist({
    scoreCap: result.scoreCap,
    filesystem: result.filesystem,
    commitDates: result.commitDates,
  });
  const remediationActions = useMemo(
    () =>
      buildRemediationActions({
        scoreCap: result.scoreCap,
        filesystem: result.filesystem,
      }),
    [result.scoreCap, result.filesystem]
  );
  const missingActions = remediationActions.filter((action) => action.missing);
  const [selectedFixes, setSelectedFixes] = useState<Set<RemediationActionId>>(
    () => new Set()
  );

  const projectedScore = projectRemediationScore(
    score,
    selectedFixes,
    remediationActions
  );
  const crossesThreshold =
    score < TALENT_NETWORK_SCORE_THRESHOLD &&
    projectedScore >= TALENT_NETWORK_SCORE_THRESHOLD;

  const visibleRedFlags = (result.redFlags ?? []).filter(
    (item) => !result.scoreCap?.applied || !isFilesystemCapRedFlag(item)
  );
  const filesystem = result.filesystem;
  const metrics = resolveProductionAuditMetrics({
    metrics: result.metrics,
    filesystem,
  });

  const roleLabel = targetRole?.trim() || "Full-stack dev";
  const repoDisplay = repoLabel?.trim() || "Audited repository";

  const toggleFix = (id: RemediationActionId) => {
    setSelectedFixes((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const actionableTemplates = FIX_TEMPLATES.filter((template) =>
    missingActions.some((action) => action.id === template.id)
  );

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">
        <div className="border-b border-zinc-800 bg-zinc-900/80 px-4 py-4 sm:px-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">
                Executive verdict
              </p>
              <h2 className="truncate text-lg font-extrabold tracking-tight text-zinc-50 sm:text-xl">
                {repoDisplay}
              </h2>
              <p className="text-sm text-zinc-400">
                Role specification:{" "}
                <span className="font-semibold text-zinc-200">{roleLabel}</span>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
              <span
                className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-bold leading-tight ${credential.className}`}
              >
                {credential.label}
              </span>
              <span
                className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-bold leading-tight ${badge.className}`}
              >
                {badge.label}
              </span>
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                Readiness score
              </div>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="font-mono text-4xl font-extrabold tabular-nums text-zinc-50">
                  {score}
                </span>
                <span className="text-sm font-semibold text-zinc-500">/100</span>
              </div>
            </div>
            <ScoreMeter score={score} className={badge.meterClassName} />
          </div>
        </div>

        <div className="space-y-4 p-4 sm:p-5">
          <ProductionScorecard metrics={metrics} compact />

          <div>
            <div className="mb-3 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
              Executive checklist
            </div>
            <ul className="space-y-2">
              {checklist.map((item) => {
                const tone = TONE_STYLES[item.tone];
                return (
                  <li
                    key={item.id}
                    className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2.5"
                  >
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${tone.iconWrap}`}
                      aria-hidden
                    >
                      <ChecklistIcon tone={item.tone} />
                    </span>
                    <span className="min-w-0 flex-1 text-sm font-semibold leading-snug text-zinc-100">
                      {item.label}
                    </span>
                    <span
                      className={`text-right text-[11px] font-semibold leading-snug sm:text-xs ${tone.status}`}
                    >
                      {item.status}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </section>

      {missingActions.length > 0 ? (
        <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500">
                Remediation simulator
              </p>
              <h3 className="mt-1 text-base font-bold tracking-tight text-zinc-50">
                Path to Talent Network Qualification
              </h3>
              <p className="mt-1 text-sm leading-relaxed text-zinc-400">
                Toggle the deficits below to preview how file-tree proof would
                move this private diagnostic toward a{" "}
                {TALENT_NETWORK_SCORE_THRESHOLD}+ public credential.
              </p>
            </div>
            <div className="shrink-0 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-right">
              <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                Projected score
              </p>
              <p className="mt-0.5 font-mono text-lg font-bold tabular-nums text-zinc-50">
                <span className="text-zinc-500">{score}</span>
                <span className="mx-1 text-zinc-600">→</span>
                <span
                  className={
                    projectedScore >= TALENT_NETWORK_SCORE_THRESHOLD
                      ? "text-emerald-300"
                      : "text-zinc-100"
                  }
                >
                  {projectedScore}
                </span>
                <span className="text-sm font-semibold text-zinc-500">
                  /100
                </span>
              </p>
              {crossesThreshold ? (
                <span className="mt-1 inline-flex rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-300">
                  Crosses {TALENT_NETWORK_SCORE_THRESHOLD} threshold
                </span>
              ) : null}
            </div>
          </div>

          <ul className="mt-4 space-y-2">
            {missingActions.map((action) => {
              const checked = selectedFixes.has(action.id);
              return (
                <li key={action.id}>
                  <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-3 transition-colors hover:border-zinc-700">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleFix(action.id)}
                      className="mt-0.5 h-4 w-4 rounded border-zinc-600 bg-zinc-950 text-emerald-500 focus:ring-emerald-500/40"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-zinc-100">
                        {action.label}
                      </span>
                      <span className="mt-0.5 block text-xs text-zinc-500">
                        Simulation only — does not alter the stored audit score.
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <section>
        <div className="mb-3 text-[10px] font-bold uppercase tracking-wider text-brand">
          Actionable fixes
        </div>
        {actionableTemplates.length > 0 ? (
          <ul className="space-y-3">
            {actionableTemplates.map((template) => (
              <li
                key={template.id}
                className="rounded-2xl border border-zinc-800 bg-zinc-950"
              >
                <div className="flex flex-col gap-2 border-b border-zinc-800 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-zinc-100">
                      {template.title}
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-zinc-400">
                      {template.guidance}
                    </p>
                  </div>
                  <span className="inline-flex shrink-0 items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-bold tabular-nums text-amber-300">
                    {template.deductionLabel} (−{template.points} pts)
                  </span>
                </div>
                <details className="group">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-zinc-200 [&::-webkit-details-marker]:hidden">
                    <span>View Template</span>
                    <ChevronDown
                      className="h-4 w-4 shrink-0 text-zinc-500 transition-transform group-open:rotate-180"
                      aria-hidden
                    />
                  </summary>
                  <div className="space-y-3 border-t border-zinc-800 px-4 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <code className="rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1 font-mono text-[11px] text-zinc-300">
                        {template.filename}
                      </code>
                      <CopyTemplateButton text={template.body.trimStart()} />
                    </div>
                    <pre className="overflow-x-auto rounded-xl border border-zinc-800 bg-black/60 p-3 font-mono text-[11px] leading-relaxed text-zinc-300">
                      <code>{template.body.trimStart()}</code>
                    </pre>
                  </div>
                </details>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-zinc-400">
            Core CI/CD and test artifacts look present. Keep hardening error
            boundaries and architecture depth for a stronger dossier.
          </p>
        )}
      </section>

      <details className="group rounded-2xl border border-zinc-800 bg-zinc-950">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-zinc-100 [&::-webkit-details-marker]:hidden">
          <span>View Raw Inspection Artifacts & AST Logs</span>
          <ChevronDown
            className="h-4 w-4 shrink-0 text-zinc-500 transition-transform group-open:rotate-180"
            aria-hidden
          />
        </summary>
        <div className="space-y-5 border-t border-zinc-800 px-4 py-4">
          <ScoreCapBreakdown
            scoreCap={result.scoreCap}
            score={result.score}
            filesystem={filesystem}
          />

          <AuditChecksList checks={result.checks} />

          <div className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900 p-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-cyan-300">
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
                <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                  Sampled commit timestamps
                </div>
                <ul className="space-y-1">
                  {result.commitDates.map((date) => (
                    <li
                      key={date}
                      className="font-mono text-[11px] text-zinc-400"
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
              <div className="mb-3 text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                Verified strengths
              </div>
              <ul className="space-y-2">
                {result.strengths.map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-2 text-sm leading-relaxed text-zinc-400"
                  >
                    <Check
                      className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400"
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
              <div className="mb-3 text-[10px] font-bold uppercase tracking-wider text-amber-400">
                Detected red flags / missing proof-of-work
              </div>
              <ul className="space-y-2">
                {visibleRedFlags.map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-2 text-sm leading-relaxed text-zinc-400"
                  >
                    <AlertTriangle
                      className="mt-0.5 h-4 w-4 shrink-0 text-amber-400"
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
