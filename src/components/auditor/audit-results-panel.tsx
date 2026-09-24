"use client";

import {
  Component,
  useEffect,
  useMemo,
  useState,
  type ErrorInfo,
  type ReactNode,
} from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Copy,
  Lock,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react";
import type { AuditResult } from "@/app/api/audit/route";
import AuditChecksList from "@/components/auditor/audit-checks-list";
import ProductionScorecard from "@/components/auditor/production-scorecard";
import ScoreCapBreakdown from "@/components/auditor/score-cap-breakdown";
import ScoreMeter from "@/components/ScoreMeter";
import {
  buildExecutiveChecklist,
  getReadinessBadge,
  resolveDisplayedReadinessScore,
  type ChecklistTone,
  type ExecutiveChecklistItem,
} from "@/lib/audit-readiness";
import { isEmployerRole } from "@/lib/dashboard-account";
import {
  emptyProductionAuditMetrics,
  resolveProductionAuditMetrics,
  type ProductionAuditMetrics,
} from "@/lib/production-audit-metrics";
import { isFilesystemCapRedFlag } from "@/lib/repo-filesystem";
import { clampScore0to100 } from "@/lib/score-scale";

/** Mirrors `PUBLIC_SCORECARD_THRESHOLD` without importing the heavy audit module. */
const PUBLIC_SCORECARD_THRESHOLD = 75;
const ROLE_SPEC_DEFAULT = "Full-stack dev";
const REMEDIATION_POINTS = 25;

const FAIL_BADGE_CLASS =
  "border border-rose-500/30 bg-rose-500/10 text-rose-400 font-mono text-xs px-2.5 py-1 rounded-md";
const PASS_BADGE_CLASS =
  "border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 font-mono text-xs px-2.5 py-1 rounded-md";

type RampUpStatus = {
  label: string;
  briefLabel: string;
  className: string;
};

function getRampUpStatus(score: number): RampUpStatus {
  const clamped = clampScore0to100(score);

  if (clamped >= 85) {
    return {
      label: "INDEPENDENT CONTRIBUTOR (0 Wk Ramp-Up)",
      briefLabel: "Independent contributor (0 wk ramp-up)",
      className:
        "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
    };
  }

  if (clamped >= 70) {
    return {
      label: "LIGHT ONBOARDING (1-2 Wk Ramp-Up)",
      briefLabel: "Light onboarding (1–2 wk ramp-up)",
      className: "border-sky-500/40 bg-amber-500/10 text-amber-300",
    };
  }

  return {
    label: "RAMP-UP: SUPERVISION REQUIRED (3-4 Wk Ramp-Up)",
    briefLabel: "Supervision required (3–4 wk ramp-up)",
    className: "border-rose-500/40 bg-rose-500/10 text-rose-400",
  };
}

type ScreenPrompt = {
  id: "ci" | "tests";
  flagLabel: string;
  deduction: string;
  label: string;
  question: string;
  listenFor: string;
};

const CI_SCREEN_PROMPT: ScreenPrompt = {
  id: "ci",
  flagLabel: "Missing CI/CD",
  deduction: "−25 pts",
  label: "Architecture & Deployment Discipline",
  question:
    "I noticed this codebase deploys without an automated CI/CD pipeline. Walk me through how you prevent breaking production migrations or lint errors across a distributed team.",
  listenFor:
    "Look for familiarity with pre-commit hooks, trunk-based vs. GitFlow branching strategies, staging environments, or linting discipline.",
};

const TESTS_SCREEN_PROMPT: ScreenPrompt = {
  id: "tests",
  flagLabel: "Missing Test Suite",
  deduction: "−25 pts",
  label: "Testing Strategy & Reliability",
  question:
    "This project currently operates with zero automated test coverage. If you had to add a smoke test to this codebase in under an hour, which critical path would you test first and why?",
  listenFor:
    "Candidates should prioritize high-risk database mutations, auth flows, or core business logic over trivial UI render tests.",
};

const CI_WORKFLOW_TEMPLATE = `name: CI
on: [push, pull_request]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run build --if-present
`;

const SMOKE_TEST_TEMPLATE = `import { describe, it, expect } from 'vitest';
describe('Production Smoke Test', () => {
  it('initializes application environment correctly', () => {
    expect(process.env).toBeDefined();
    expect(true).toBe(true);
  });
});
`;

type RemediationId = "ci" | "tests" | "error_handling";

type RemediationDrawer = {
  filePath: string;
  directions: string;
  language: "yaml" | "typescript";
  content: string;
};

type RemediationItem = {
  id: RemediationId;
  label: string;
  points: number;
  drawer?: RemediationDrawer;
};

type ActionableFix = {
  id: RemediationId;
  title: string;
  deductionLabel: string;
  summary: string;
  template?: {
    filename: string;
    language: "yaml" | "typescript";
    content: string;
    directions?: string;
  };
};

const SECTION_LABEL =
  "text-[11px] font-semibold uppercase tracking-wider text-zinc-500";

const TONE_PILL: Record<ChecklistTone, string> = {
  pass: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
  warn: "bg-violet-500/10 text-violet-400 border border-violet-500/20",
  fail: "bg-red-500/10 text-red-400 border border-red-500/20",
};

const TONE_STYLES: Record<
  ChecklistTone,
  { iconWrap: string; status: string }
> = {
  pass: {
    iconWrap: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
    status: "text-emerald-300",
  },
  warn: {
    iconWrap: "border-violet-500/30 bg-violet-500/10 text-violet-400",
    status: "text-violet-300",
  },
  fail: {
    iconWrap: "border-rose-500/30 bg-rose-500/10 text-rose-400",
    status: "text-rose-400",
  },
};

function remediationTitle(label: string): string {
  return label.replace(/\s*\(\+\d+\s*pts?\)\s*$/i, "").trim() || label;
}

function formatAuditDateLabel(commitDates?: string[] | null): string {
  const parsed = (commitDates ?? [])
    .map((value) => Date.parse(value))
    .filter((value) => Number.isFinite(value));
  const timestamp =
    parsed.length > 0 ? Math.max(...parsed) : Date.now();
  return new Date(timestamp).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

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
      <div className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider mb-2">
        {title}
      </div>
      {paths.length > 0 ? (
        <ul className="space-y-1">
          {paths.map((path) => (
            <li
              key={path}
              className="font-mono text-[11px] text-zinc-500 leading-relaxed break-all"
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

function remediationPointsFor(
  result: AuditResult,
  artifact: RemediationId
): number {
  const match = result?.scoreCap?.deductions?.find(
    (row) => row.artifact === artifact && row.points > 0
  );
  return match?.points ?? REMEDIATION_POINTS;
}

function buildRemediationItems(result: AuditResult): RemediationItem[] {
  try {
    const artifacts = result?.scoreCap?.coreArtifacts ?? {
      ci: (result?.filesystem?.ci_workflow_paths?.length ?? 0) > 0,
      tests: (result?.filesystem?.test_paths?.length ?? 0) > 0,
      error_handling:
        (result?.filesystem?.error_handling_paths?.length ?? 0) > 0,
    };

    const items: RemediationItem[] = [];

    if (!artifacts.ci) {
      const points = remediationPointsFor(result, "ci");
      items.push({
        id: "ci",
        label: `Add GitHub Actions CI/CD (+${points} pts)`,
        points,
        drawer: {
          filePath: ".github/workflows/ci.yml",
          directions:
            "Add this minimal GitHub Actions workflow to your repository root to run builds and automated validation on push and pull requests.",
          language: "yaml",
          content: CI_WORKFLOW_TEMPLATE,
        },
      });
    }

    if (!artifacts.tests) {
      const points = remediationPointsFor(result, "tests");
      items.push({
        id: "tests",
        label: `Add basic test suite (+${points} pts)`,
        points,
        drawer: {
          filePath: "src/__tests__/smoke.test.ts",
          directions:
            "Install Vitest (`npm i -D vitest`) and add this baseline smoke test to verify application environment initialization.",
          language: "typescript",
          content: SMOKE_TEST_TEMPLATE,
        },
      });
    }

    if (!artifacts.error_handling) {
      const points = remediationPointsFor(result, "error_handling");
      const isWebApp = result?.metrics?.evidence?.repoKind === "web_app";
      items.push({
        id: "error_handling",
        label: isWebApp
          ? `Add error boundaries (+${points} pts)`
          : `Add structured error handling (+${points} pts)`,
        points,
      });
    }

    return items;
  } catch (error) {
    console.error("Remediation item derive failed:", error);
    return [];
  }
}

function buildActionableFixes(result: AuditResult): ActionableFix[] {
  try {
    const artifacts = result?.scoreCap?.coreArtifacts ?? {
      ci: (result?.filesystem?.ci_workflow_paths?.length ?? 0) > 0,
      tests: (result?.filesystem?.test_paths?.length ?? 0) > 0,
      error_handling:
        (result?.filesystem?.error_handling_paths?.length ?? 0) > 0,
    };

    const fixes: ActionableFix[] = [];

    if (!artifacts.ci) {
      const points = remediationPointsFor(result, "ci");
      fixes.push({
        id: "ci",
        title: "Missing CI/CD pipeline",
        deductionLabel: `−${points} pts`,
        summary:
          "No `.github/workflows/*.yml` detected. Shipping a GitHub Actions workflow restores the DevOps pillar.",
        template: {
          filename: ".github/workflows/ci.yml",
          language: "yaml",
          directions:
            "Add this minimal GitHub Actions workflow to your repository root to run builds and automated validation on push and pull requests.",
          content: CI_WORKFLOW_TEMPLATE,
        },
      });
    }

    if (!artifacts.tests) {
      const points = remediationPointsFor(result, "tests");
      fixes.push({
        id: "tests",
        title: "Missing test suite",
        deductionLabel: `−${points} pts`,
        summary:
          "No test files or runner config found. A minimal smoke suite unblocks the tests pillar and proves regression coverage exists.",
        template: {
          filename: "src/__tests__/smoke.test.ts",
          language: "typescript",
          directions:
            "Install Vitest (`npm i -D vitest`) and add this baseline smoke test to verify application environment initialization.",
          content: SMOKE_TEST_TEMPLATE,
        },
      });
    }

    if (!artifacts.error_handling) {
      const points = remediationPointsFor(result, "error_handling");
      const isWebApp = result?.metrics?.evidence?.repoKind === "web_app";
      fixes.push({
        id: "error_handling",
        title: isWebApp
          ? "Missing error boundaries"
          : "Missing structured error handling",
        deductionLabel: `−${points} pts`,
        summary: isWebApp
          ? "No `error.tsx` / ErrorBoundary modules detected. That deducts 35 from the resilience pillar (not a drop to 0). Add an App Router `error.tsx` or a React error boundary; wrap remaining fetch/await calls in try/catch."
          : "No try/catch modules or error-handler files detected. Resilience starts at 100 and only falls for unhandled async/fetch (15 points each, max 50). React error boundaries are not required for libraries or backend packages.",
      });
    }

    return fixes;
  } catch (error) {
    console.error("Actionable fix derive failed:", error);
    return [];
  }
}

function highlightCode(
  content: string,
  language: "yaml" | "typescript"
): ReactNode[] {
  const lines = content.replace(/\n$/, "").split("\n");

  return lines.map((line, index) => {
    const nodes: ReactNode[] = [];
    let remaining = line;

    const pushPlain = (text: string) => {
      if (text) {
        nodes.push(
          <span key={`${index}-plain-${nodes.length}`} className="text-zinc-300">
            {text}
          </span>
        );
      }
    };

    if (language === "yaml") {
      const commentMatch = remaining.match(/^(\s*)(#.*)$/);
      if (commentMatch) {
        nodes.push(
          <span key={`${index}-c`} className="text-zinc-500">
            {commentMatch[1]}
            {commentMatch[2]}
          </span>
        );
      } else {
        const keyMatch = remaining.match(/^(\s*)([A-Za-z0-9_-]+)(:)(.*)$/);
        if (keyMatch) {
          nodes.push(
            <span key={`${index}-i`} className="text-zinc-600">
              {keyMatch[1]}
            </span>,
            <span key={`${index}-k`} className="text-sky-300">
              {keyMatch[2]}
            </span>,
            <span key={`${index}-colon`} className="text-zinc-500">
              {keyMatch[3]}
            </span>
          );
          const value = keyMatch[4];
          if (/^\s*\d+\s*$/.test(value)) {
            nodes.push(
              <span key={`${index}-n`} className="text-violet-300">
                {value}
              </span>
            );
          } else if (/^\s*\[/.test(value)) {
            nodes.push(
              <span key={`${index}-a`} className="text-emerald-300">
                {value}
              </span>
            );
          } else {
            nodes.push(
              <span key={`${index}-v`} className="text-zinc-200">
                {value}
              </span>
            );
          }
        } else if (/^\s*-\s/.test(remaining)) {
          const dashMatch = remaining.match(/^(\s*-\s)(.*)$/);
          nodes.push(
            <span key={`${index}-d`} className="text-indigo-300">
              {dashMatch?.[1]}
            </span>,
            <span key={`${index}-dv`} className="text-zinc-200">
              {dashMatch?.[2]}
            </span>
          );
        } else {
          pushPlain(remaining);
        }
      }
    } else {
      const commentMatch = remaining.match(/^(\s*)(\/\/.*)$/);
      if (commentMatch) {
        nodes.push(
          <span key={`${index}-c`} className="text-zinc-500">
            {commentMatch[1]}
            {commentMatch[2]}
          </span>
        );
      } else {
        const parts = remaining.split(
          /(\b(?:import|from|describe|it|expect|const|let|var|function|return|true|false|null|undefined)\b|'[^']*'|"[^"]*"|`[^`]*`)/g
        );
        parts.forEach((part, partIndex) => {
          if (!part) return;
          if (
            /^(import|from|describe|it|expect|const|let|var|function|return)$/.test(
              part
            )
          ) {
            nodes.push(
              <span key={`${index}-kw-${partIndex}`} className="text-violet-300">
                {part}
              </span>
            );
          } else if (/^(true|false|null|undefined)$/.test(part)) {
            nodes.push(
              <span key={`${index}-lit-${partIndex}`} className="text-violet-300">
                {part}
              </span>
            );
          } else if (/^['"`]/.test(part)) {
            nodes.push(
              <span key={`${index}-str-${partIndex}`} className="text-emerald-300">
                {part}
              </span>
            );
          } else {
            nodes.push(
              <span key={`${index}-tx-${partIndex}`} className="text-zinc-300">
                {part}
              </span>
            );
          }
        });
      }
    }

    return (
      <span key={`line-${index}`} className="block">
        {nodes.length > 0 ? nodes : "\u00A0"}
      </span>
    );
  });
}

function CopyCodeButton({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
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
      className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-200 transition-colors hover:bg-zinc-800 cursor-pointer"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden />
      ) : (
        <Copy className="h-3.5 w-3.5 text-zinc-400" aria-hidden />
      )}
      {copied ? "Copied" : "Copy Code"}
    </button>
  );
}

function CodeSnippet({
  filePath,
  directions,
  language,
  content,
}: RemediationDrawer) {
  return (
    <div className="space-y-3 border-t border-indigo-500/20 px-3 py-3">
      <div>
        <p className="font-mono text-[11px] text-indigo-300 truncate">{filePath}</p>
        <p className="mt-1.5 text-xs text-zinc-400 leading-relaxed">{directions}</p>
      </div>
      <div className="overflow-hidden rounded-lg border border-zinc-800 bg-black/70">
        <div className="flex items-center justify-between gap-2 border-b border-zinc-800 px-3 py-2">
          <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
            {language}
          </span>
          <CopyCodeButton content={content} />
        </div>
        <pre
          className="overflow-x-auto p-3 text-[11px] leading-relaxed font-mono"
          tabIndex={0}
          aria-label={`${filePath} template`}
        >
          <code>{highlightCode(content, language)}</code>
        </pre>
      </div>
    </div>
  );
}

function StatusBadge({
  pass,
  children,
  animateKey,
}: {
  pass: boolean;
  children: ReactNode;
  animateKey?: string | number;
}) {
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    if (animateKey === undefined) {
      return;
    }
    setPulse(true);
    const timer = window.setTimeout(() => setPulse(false), 320);
    return () => window.clearTimeout(timer);
  }, [animateKey]);

  return (
    <span
      className={`inline-flex items-center gap-1.5 uppercase tracking-wide transition-all duration-300 ease-out ${
        pass ? PASS_BADGE_CLASS : FAIL_BADGE_CLASS
      } ${pulse ? "scale-105 shadow-md shadow-current/20" : "scale-100"}`}
    >
      {children}
    </span>
  );
}

function RemediationSimulator({
  score,
  items,
}: {
  score: number;
  items: RemediationItem[];
}) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const projected = useMemo(() => {
    const bonus = items.reduce(
      (sum, item) => (checked[item.id] ? sum + item.points : sum),
      0
    );
    return clampScore0to100(score + bonus);
  }, [checked, items, score]);

  const qualifies = projected >= PUBLIC_SCORECARD_THRESHOLD;
  const alreadyCleared = score >= PUBLIC_SCORECARD_THRESHOLD;

  if (alreadyCleared || items.length === 0) {
    return (
      <section className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 backdrop-blur-sm">
        <div className="flex items-center gap-2.5">
          <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden />
          <p className="text-sm font-medium text-emerald-300">
            All Core Production Artifacts Verified
          </p>
          <span className="ml-auto font-mono text-xs tabular-nums text-emerald-400/80">
            {score}/100
          </span>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4 rounded-xl border border-zinc-800/80 bg-zinc-950 p-5 sm:p-6 backdrop-blur-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className={`${SECTION_LABEL} mb-1`}>Remediation Simulator</div>
          <h3 className="text-sm font-bold tracking-tight text-zinc-100">
            Path to Talent Network Qualification
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-zinc-500">
            Simulate targeted fixes to reach the {PUBLIC_SCORECARD_THRESHOLD}+
            network threshold. Select items below to inspect remediation steps.
          </p>
        </div>
        <div className="shrink-0 space-y-1.5 sm:text-right">
          <div className={SECTION_LABEL}>Projected Score</div>
          <div
            className="flex flex-wrap items-baseline gap-1 sm:justify-end"
            aria-live="polite"
            aria-atomic="true"
          >
            <span
              className={`font-mono text-4xl font-black tabular-nums tracking-tight transition-colors duration-300 ${
                qualifies ? "text-emerald-400" : "text-white"
              }`}
            >
              {projected}
            </span>
            <span className="text-base font-semibold text-zinc-500">/100</span>
          </div>
          {projected !== score ? (
            <p className="font-mono text-xs tabular-nums text-zinc-500 sm:text-right">
              from {score}
            </p>
          ) : null}
          <StatusBadge pass={qualifies} animateKey={projected}>
            {qualifies ? (
              <>
                <ShieldCheck className="h-3 w-3" aria-hidden />
                Qualifies
              </>
            ) : (
              <>
                <Lock className="h-3 w-3" aria-hidden />
                Below {PUBLIC_SCORECARD_THRESHOLD}
              </>
            )}
          </StatusBadge>
        </div>
      </div>

      <ul className="space-y-2">
        {items.map((item) => {
          const isOn = Boolean(checked[item.id]);
          const isOpen = Boolean(expanded[item.id]);
          const hasDrawer = Boolean(item.drawer);
          const title = remediationTitle(item.label);

          return (
            <li
              key={item.id}
              className="overflow-hidden rounded-lg border border-zinc-800/80 bg-zinc-900/60 transition hover:bg-zinc-900/80"
            >
              <div className="flex items-center justify-between gap-3 p-3.5">
                <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    checked={isOn}
                    onChange={(event) =>
                      setChecked((prev) => ({
                        ...prev,
                        [item.id]: event.target.checked,
                      }))
                    }
                    className="h-4 w-4 cursor-pointer rounded border-zinc-600 bg-zinc-950 text-emerald-500 focus:ring-0"
                  />
                  <span className="min-w-0 flex-1 text-sm font-medium leading-snug text-zinc-200">
                    {title}
                  </span>
                </label>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="rounded border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 font-mono text-xs font-medium text-emerald-400">
                    +{item.points} pts
                  </span>
                  {hasDrawer ? (
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      aria-label={
                        isOpen
                          ? `Collapse ${title} template`
                          : `Expand ${title} template`
                      }
                      onClick={() =>
                        setExpanded((prev) => ({
                          ...prev,
                          [item.id]: !prev[item.id],
                        }))
                      }
                      className="inline-flex cursor-pointer items-center justify-center text-zinc-500 transition-colors hover:text-zinc-200"
                    >
                      <ChevronDown
                        className={`h-4 w-4 transition-transform duration-200 ${
                          isOpen ? "rotate-180" : ""
                        }`}
                        aria-hidden
                      />
                    </button>
                  ) : null}
                </div>
              </div>
              {hasDrawer && isOpen && item.drawer ? (
                <CodeSnippet {...item.drawer} />
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function buildScreenPrompts(result: AuditResult): ScreenPrompt[] {
  try {
    const artifacts = result?.scoreCap?.coreArtifacts ?? {
      ci: (result?.filesystem?.ci_workflow_paths?.length ?? 0) > 0,
      tests: (result?.filesystem?.test_paths?.length ?? 0) > 0,
    };

    const prompts: ScreenPrompt[] = [];
    if (!artifacts.ci) {
      prompts.push(CI_SCREEN_PROMPT);
    }
    if (!artifacts.tests) {
      prompts.push(TESTS_SCREEN_PROMPT);
    }
    return prompts;
  } catch {
    return [];
  }
}

function formatInterviewBriefMarkdown(input: {
  repoName: string;
  score: number;
  badgeLabel: string;
  prompts: ScreenPrompt[];
  redFlags: string[];
}): string {
  const rampUp = getRampUpStatus(input.score);
  const lines = [
    `# Technical Interview Brief`,
    ``,
    `**Repository:** ${input.repoName}`,
    `**Readiness Score:** ${input.score}/100`,
    `**Verdict:** ${input.badgeLabel}`,
    `**Ramp-Up:** ${rampUp.briefLabel}`,
    ``,
  ];

  if (input.redFlags.length > 0) {
    lines.push(`## Detected Flags`, ``);
    for (const flag of input.redFlags) {
      lines.push(`- ${flag}`);
    }
    lines.push(``);
  }

  if (input.prompts.length === 0) {
    lines.push(
      `## Screen Prompts`,
      ``,
      `_No CI/CD or test-suite deficits detected. Use architecture deep-dives instead._`,
      ``
    );
  } else {
    lines.push(`## Screen Prompts`, ``);
    for (const prompt of input.prompts) {
      lines.push(
        `### ${prompt.label} (${prompt.flagLabel} ${prompt.deduction})`,
        ``,
        `**Question:** ${prompt.question}`,
        ``,
        `**What to listen for:** ${prompt.listenFor}`,
        ``
      );
    }
  }

  return lines.join("\n").trim() + "\n";
}

function CopyPromptButton({
  question,
  listenFor,
}: {
  question: string;
  listenFor: string;
}) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    const payload = `Question: ${question}\n\nWhat to Listen For: ${listenFor}`;
    try {
      await navigator.clipboard.writeText(payload);
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
      className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-200 transition-colors hover:bg-zinc-800 cursor-pointer"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden />
      ) : (
        <Copy className="h-3.5 w-3.5 text-zinc-400" aria-hidden />
      )}
      {copied ? "Copied" : "Copy Question & Rubric"}
    </button>
  );
}

function TechnicalScreenGenerator({
  prompts,
  score,
}: {
  prompts: ScreenPrompt[];
  score: number;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const rampUp = getRampUpStatus(score);

  return (
    <section className="rounded-2xl border border-indigo-500/30 bg-zinc-900/80 p-4 sm:p-5 shadow-lg shadow-indigo-500/5 space-y-4">
      <div className="mb-4 w-full">
        <div className="flex w-full items-center justify-between gap-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-300">
            Technical Screen Generator
          </h3>
          <span
            className={`inline-flex max-w-[min(100%,22rem)] shrink-0 items-center rounded border px-2.5 py-1 text-right text-[11px] font-mono font-medium ${rampUp.className}`}
          >
            {rampUp.label}
          </span>
        </div>
        <p className="mt-1.5 text-xs text-zinc-400 leading-relaxed">
          Targeted technical interview questions and grading rubrics generated
          directly from repository architectural deficits.
        </p>
      </div>

      {prompts.length === 0 ? (
        <p className="text-sm text-zinc-400 leading-relaxed">
          No CI/CD or test-suite deficits flagged. Core production artifacts look
          present — pivot the screen to architecture ownership and production
          incident stories.
        </p>
      ) : (
        <ul className="space-y-2">
          {prompts.map((prompt) => {
            const isOpen = Boolean(expanded[prompt.id]);
            return (
              <li
                key={prompt.id}
                className="rounded-xl border border-zinc-800 bg-zinc-950/80 overflow-hidden"
              >
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() =>
                    setExpanded((prev) => ({
                      ...prev,
                      [prompt.id]: !prev[prompt.id],
                    }))
                  }
                  className="flex w-full cursor-pointer items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-zinc-900/60"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-zinc-100 leading-snug">
                      {prompt.label}
                    </p>
                    <p className="mt-0.5 font-mono text-[11px] text-rose-400">
                      {prompt.flagLabel} {prompt.deduction}
                    </p>
                  </div>
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-zinc-500 transition-transform duration-200 ${
                      isOpen ? "rotate-180" : ""
                    }`}
                    aria-hidden
                  />
                </button>
                {isOpen ? (
                  <div className="space-y-3 border-t border-indigo-500/20 px-3 py-3">
                    <div>
                      <p className="text-[10px] uppercase font-bold tracking-wider text-zinc-500 mb-1">
                        Question
                      </p>
                      <p className="text-sm text-zinc-200 leading-relaxed">
                        {prompt.question}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase font-bold tracking-wider text-zinc-500 mb-1">
                        What to Listen For
                      </p>
                      <p className="text-sm text-zinc-400 leading-relaxed">
                        {prompt.listenFor}
                      </p>
                    </div>
                    <CopyPromptButton
                      question={prompt.question}
                      listenFor={prompt.listenFor}
                    />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function CandidateActionToolbar({
  onRescan,
  rescanning,
}: {
  onRescan?: () => void;
  rescanning: boolean;
}) {
  if (!onRescan) {
    return null;
  }

  return (
    <div className="pt-1">
      <button
        type="button"
        onClick={onRescan}
        disabled={rescanning}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-brand/30 bg-brand py-3.5 px-6 text-sm font-semibold text-white transition-colors hover:bg-brandHover disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
      >
        <RefreshCw
          className={`h-4 w-4 ${rescanning ? "animate-spin" : ""}`}
          aria-hidden
        />
        {rescanning
          ? "Re-scanning repository…"
          : "Commit Changes & Re-Scan Repository"}
      </button>
    </div>
  );
}

function EmployerActionToolbar({
  briefMarkdown,
}: {
  briefMarkdown: string;
}) {
  const [copied, setCopied] = useState(false);

  const onCopyBrief = async () => {
    try {
      await navigator.clipboard.writeText(briefMarkdown);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="pt-1">
      <button
        type="button"
        onClick={() => void onCopyBrief()}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-indigo-500/40 bg-indigo-600 py-3.5 px-6 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 cursor-pointer"
      >
        {copied ? (
          <Check className="h-4 w-4 text-emerald-200" aria-hidden />
        ) : (
          <Copy className="h-4 w-4" aria-hidden />
        )}
        {copied ? "Copied to clipboard!" : "Copy Complete Interview Brief"}
      </button>
    </div>
  );
}

function ActionableFixDrawer({ fix }: { fix: ActionableFix }) {
  const [open, setOpen] = useState(false);

  return (
    <li className="rounded-xl border border-zinc-800 bg-zinc-950 overflow-hidden">
      <div className="px-3 py-3 sm:px-4 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-zinc-100 leading-snug">
              {fix.title}
            </p>
            <p className="mt-1 text-xs text-zinc-500 leading-relaxed">
              {fix.summary}
            </p>
          </div>
          <span className={FAIL_BADGE_CLASS}>{fix.deductionLabel}</span>
        </div>

        {fix.template ? (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 overflow-hidden">
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpen((prev) => !prev)}
              className="flex w-full cursor-pointer items-center justify-between gap-3 px-3 py-2 text-left text-xs font-semibold text-zinc-200 transition-colors hover:bg-zinc-900"
            >
              <span>View Template · {fix.template.filename}</span>
              <ChevronDown
                className={`h-3.5 w-3.5 shrink-0 text-zinc-500 transition-transform duration-200 ${
                  open ? "rotate-180" : ""
                }`}
                aria-hidden
              />
            </button>
            {open ? (
              <CodeSnippet
                filePath={fix.template.filename}
                directions={
                  fix.template.directions ??
                  "Copy this boilerplate into your repository, commit, then re-scan."
                }
                language={fix.template.language}
                content={fix.template.content}
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </li>
  );
}

type AuditResultsPanelProps = {
  result: AuditResult;
  repoName?: string;
  repoUrl?: string;
  roleSpec?: string;
  /** Account role (`employer` / `business`) or force employer dossier UI. */
  viewerRole?: string | null;
  isEmployerView?: boolean;
  onRescan?: () => void;
  rescanning?: boolean;
};

function safeDeriveAuditView(result: AuditResult): {
  score: number;
  badge: ReturnType<typeof getReadinessBadge>;
  checklist: ExecutiveChecklistItem[];
  visibleRedFlags: string[];
  metrics: ProductionAuditMetrics;
  remediationItems: RemediationItem[];
  actionableFixes: ActionableFix[];
} {
  try {
    const filesystem = result?.filesystem ?? null;
    const metrics = resolveProductionAuditMetrics({
      metrics: result?.metrics,
      filesystem,
    });
    const score = resolveDisplayedReadinessScore({
      score: result?.score ?? 0,
      productionScore: metrics.productionScore,
      filesystem,
      scoreCap: result?.scoreCap,
      commitDates: result?.commitDates,
    });
    return {
      score,
      badge: getReadinessBadge(score),
      checklist: buildExecutiveChecklist({
        scoreCap: result?.scoreCap,
        filesystem,
        commitDates: result?.commitDates ?? [],
      }),
      visibleRedFlags: (result?.redFlags ?? []).filter(
        (item) => !result?.scoreCap?.applied || !isFilesystemCapRedFlag(item)
      ),
      metrics,
      remediationItems: buildRemediationItems(result),
      actionableFixes: buildActionableFixes(result),
    };
  } catch (error) {
    console.error("Executive dossier derive failed:", error);
    const score = clampScore0to100(result?.score ?? 0);
    return {
      score,
      badge: getReadinessBadge(score),
      checklist: [],
      visibleRedFlags: [],
      metrics: emptyProductionAuditMetrics(),
      remediationItems: [],
      actionableFixes: [],
    };
  }
}

function AuditResultsFallback({
  score,
  message,
}: {
  score: number;
  message: string;
}) {
  return (
    <div className="rounded-2xl border border-violet-500/30 bg-violet-500/5 p-4 sm:p-5 space-y-3">
      <div className="text-[10px] uppercase font-bold tracking-wider text-violet-400">
        Executive Dossier Unavailable
      </div>
      <p className="text-sm text-zinc-300 leading-relaxed">{message}</p>
      <p className="font-mono text-3xl font-black tabular-nums text-zinc-50">
        {clampScore0to100(score)}
        <span className="text-sm font-semibold text-zinc-500">/100</span>
      </p>
    </div>
  );
}

class AuditResultsErrorBoundary extends Component<
  { children: ReactNode; fallbackScore: number },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Executive dossier render crashed:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <AuditResultsFallback
          score={this.props.fallbackScore}
          message="A parsing or render error blocked the dossier. Navigation to other AI tools remains available — re-run the audit to retry this view."
        />
      );
    }
    return this.props.children;
  }
}

function readinessBadgeClass(score: number): string {
  return score >= PUBLIC_SCORECARD_THRESHOLD
    ? PASS_BADGE_CLASS
    : FAIL_BADGE_CLASS;
}

function AuditResultsPanelView({
  result,
  repoName,
  roleSpec = ROLE_SPEC_DEFAULT,
  viewerRole = null,
  isEmployerView = false,
  onRescan,
  rescanning = false,
}: AuditResultsPanelProps) {
  const derived = safeDeriveAuditView(result);
  const {
    score,
    badge,
    checklist,
    visibleRedFlags,
    metrics,
    remediationItems,
    actionableFixes,
  } = derived;
  const filesystem = result?.filesystem ?? null;
  const displayRepo = repoName?.trim() || "Audited repository";
  const auditedLabel = formatAuditDateLabel(result?.commitDates);
  const isRestricted = score < PUBLIC_SCORECARD_THRESHOLD;
  const employerView = isEmployerView || isEmployerRole(viewerRole);
  const screenPrompts = useMemo(
    () => (employerView ? buildScreenPrompts(result) : []),
    [employerView, result]
  );
  const briefMarkdown = useMemo(
    () =>
      formatInterviewBriefMarkdown({
        repoName: displayRepo,
        score,
        badgeLabel: badge.label,
        prompts: screenPrompts,
        redFlags: visibleRedFlags,
      }),
    [badge.label, displayRepo, score, screenPrompts, visibleRedFlags]
  );

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <section className="space-y-4 rounded-xl border border-zinc-800/80 bg-zinc-950 p-5 sm:p-6 backdrop-blur-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-3">
            <div className={SECTION_LABEL}>Executive Verdict</div>
            <h2 className="truncate text-lg font-extrabold tracking-tight text-zinc-50 sm:text-xl">
              {displayRepo}
            </h2>
            <p className="font-mono text-xs tabular-nums text-zinc-400 sm:text-sm">
              Audited {auditedLabel} · Target: {PUBLIC_SCORECARD_THRESHOLD}+
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-md border border-zinc-700/60 bg-zinc-900/60 px-2.5 py-1 text-[11px] font-semibold text-zinc-300">
                {roleSpec}
              </span>
              {isRestricted ? (
                <span className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700/60 bg-zinc-900/80 px-2.5 py-1 text-xs font-medium text-zinc-400">
                  <Lock className="h-3.5 w-3.5 text-zinc-400" aria-hidden />
                  Private Audit
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-400">
                  <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
                  Talent Network Eligible
                </span>
              )}
            </div>
          </div>
          <div className="shrink-0 space-y-2 sm:text-right">
            <div className={SECTION_LABEL}>Readiness Score</div>
            <div className="flex items-baseline gap-1 sm:justify-end">
              <span className="font-mono text-4xl font-black tabular-nums tracking-tight text-white drop-shadow-[0_0_12px_rgba(255,255,255,0.08)] sm:text-5xl">
                {score}
              </span>
              <span className="text-base font-semibold text-zinc-400">/100</span>
            </div>
            <span
              className={`mt-1 inline-flex w-fit max-w-full items-center rounded-md border px-2.5 py-1 text-xs font-medium ${readinessBadgeClass(
                score
              )}`}
            >
              {badge.label}
            </span>
          </div>
        </div>

        <ScoreMeter score={score} />

        <ProductionScorecard metrics={metrics} compact />
      </section>

      {employerView ? (
        <TechnicalScreenGenerator prompts={screenPrompts} score={score} />
      ) : (
        <RemediationSimulator
          key={`${score}-${remediationItems.map((item) => item.id).join("-")}`}
          score={score}
          items={remediationItems}
        />
      )}

      <section className="rounded-xl border border-zinc-800/80 bg-zinc-950 p-5 sm:p-6 backdrop-blur-sm">
        <div className={`${SECTION_LABEL} mb-3`}>Executive Checklist</div>
        <ul className="space-y-2">
          {checklist.map((item) => {
            const tone = TONE_STYLES[item.tone];
            const rawStatus = item.status?.trim() ?? "";
            const statusText =
              !rawStatus || /History\s*\(\s*\)/i.test(rawStatus)
                ? item.id === "commit_cadence"
                  ? "active"
                  : "Unavailable"
                : rawStatus;
            return (
              <li
                key={item.id}
                className="flex items-center gap-3 rounded-xl border border-zinc-800/80 bg-zinc-900/60 px-3.5 py-3"
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
                  className={`inline-flex max-w-[55%] shrink-0 truncate rounded-md px-2 py-0.5 text-[11px] font-medium sm:text-xs ${TONE_PILL[item.tone]}`}
                >
                  {statusText}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      {!employerView ? (
        <section>
          <div className={`${SECTION_LABEL} mb-3 text-violet-400`}>
            Actionable Fixes
          </div>
          {actionableFixes.length > 0 ? (
            <ul className="space-y-3">
              {actionableFixes.map((fix) => (
                <ActionableFixDrawer key={fix.id} fix={fix} />
              ))}
            </ul>
          ) : (
            <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 px-3 py-3 text-sm text-zinc-300">
              Core production artifacts are present. No CI/CD or test deductions
              remain on this dossier.
            </div>
          )}
        </section>
      ) : null}

      <details className="group rounded-xl border border-zinc-800/80 bg-zinc-950 backdrop-blur-sm">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-zinc-100 [&::-webkit-details-marker]:hidden">
          <span>View Raw Inspection Artifacts &amp; AST Logs</span>
          <ChevronDown
            className="h-4 w-4 shrink-0 text-zinc-500 transition-transform group-open:rotate-180"
            aria-hidden
          />
        </summary>
        <div className="space-y-5 border-t border-zinc-800 px-4 py-4">
          <ScoreCapBreakdown
            scoreCap={result?.scoreCap}
            score={result?.score}
            filesystem={filesystem}
          />

          <AuditChecksList checks={result?.checks ?? []} />

          <div className="space-y-4 rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-3">
            <div className={`${SECTION_LABEL} text-cyan-300`}>
              Filesystem paths &amp; AST evidence
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
            {(result?.commitDates ?? []).length > 0 ? (
              <div>
                <div className={`${SECTION_LABEL} mb-2`}>
                  Sampled commit timestamps
                </div>
                <ul className="space-y-1">
                  {(result.commitDates ?? []).map((date) => (
                    <li
                      key={date}
                      className="font-mono text-[11px] text-zinc-500"
                    >
                      {date}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          {(result?.strengths ?? []).length > 0 ? (
            <div>
              <div className={`${SECTION_LABEL} mb-3 text-emerald-400`}>
                Verified Strengths
              </div>
              <ul className="space-y-2">
                {(result.strengths ?? []).map((item) => (
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
              <div className={`${SECTION_LABEL} mb-3 text-violet-400`}>
                Detected Red Flags / Missing Proof-of-Work
              </div>
              <ul className="space-y-2">
                {visibleRedFlags.map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-2 text-sm leading-relaxed text-zinc-400"
                  >
                    <AlertTriangle
                      className="mt-0.5 h-4 w-4 shrink-0 text-violet-400"
                      aria-hidden
                    />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {employerView && briefMarkdown ? (
            <div className="space-y-2">
              <div className={SECTION_LABEL}>Interview brief</div>
              <pre className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-950 p-3 font-mono text-[11px] leading-relaxed text-zinc-400 whitespace-pre-wrap">
                {briefMarkdown}
              </pre>
            </div>
          ) : null}
        </div>
      </details>

      {employerView ? (
        <EmployerActionToolbar briefMarkdown={briefMarkdown} />
      ) : (
        <CandidateActionToolbar onRescan={onRescan} rescanning={rescanning} />
      )}
    </div>
  );
}

export default function AuditResultsPanel(props: AuditResultsPanelProps) {
  const fallbackScore = clampScore0to100(props.result?.score ?? 0);

  return (
    <AuditResultsErrorBoundary fallbackScore={fallbackScore}>
      <AuditResultsPanelView {...props} />
    </AuditResultsErrorBoundary>
  );
}

