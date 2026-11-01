"use client";

import { useEffect, useState } from "react";
import type { FirewallReport, FirewallViolation } from "@/lib/firewall-contract";
import { violationCategory } from "@/lib/firewall-contract";
import { isActionableSecurityFinding } from "@/lib/firewall-autofix";
import { RemediationDiff } from "@/components/firewall/remediation-diff";
import { useFirewallView } from "@/components/firewall/firewall-view-context";
import { useGithubRepoWriteAccess } from "@/components/firewall/use-github-repo-write-access";
import {
  FilePathPill,
  StatusPill,
  filterChipClass,
  formatBoundaryId,
  mutedLabelClass,
  panelClass,
  rowHoverClass,
  sectionLabelClass,
  severityLabel,
  severityTone,
  statusPillClass,
} from "@/components/firewall/firewall-ui";

const METRICS = [
  { id: "SECRET_LEAK" as const, label: "Secrets" },
  { id: "CLIENT_DB_EXPOSURE" as const, label: "Client DB" },
  { id: "VULNERABLE_DEPENDENCY" as const, label: "Dependencies" },
];

const LIST_FILTERS = [
  { id: "action" as const, label: "Needs action" },
  { id: "opened" as const, label: "PR opened" },
  { id: "all" as const, label: "All" },
];

type ListFilter = (typeof LIST_FILTERS)[number]["id"];

function findingKey(finding: FirewallViolation): string {
  return `${finding.category ?? "SECURITY"}:${finding.filePath}:${finding.line}:${finding.message}`;
}

function findingsFor(report: FirewallReport, category: (typeof METRICS)[number]["id"]): FirewallViolation[] {
  return report.violations.filter(
    (violation) =>
      violation.category === category &&
      violationCategory(violation) !== "ARCHITECTURE" &&
      isActionableSecurityFinding(violation)
  );
}

function summaryLines(message: string): string {
  const trimmed = message.trim().replace(/\s+/g, " ");
  if (trimmed.length <= 160) return trimmed;
  return `${trimmed.slice(0, 157).trimEnd()}…`;
}

function FindingSnippet({ snippet }: { snippet: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="text-xs text-zinc-500 transition-colors hover:text-zinc-300"
      >
        {open ? "Hide code" : "Inspect code"}
      </button>
      {open ? (
        <pre className="mt-2 max-h-48 overflow-auto rounded-lg border border-white/[0.06] bg-black/50 px-3 py-2.5 font-mono text-[11px] leading-relaxed text-zinc-400">
          <code>{snippet}</code>
        </pre>
      ) : null}
    </div>
  );
}

function FindingMeta({
  finding,
  prOpen,
}: {
  finding: FirewallViolation;
  prOpen?: boolean;
}) {
  const tone = prOpen ? "ok" : severityTone(finding.severity);
  const statusLabel = prOpen ? "Fixed" : severityLabel(finding.severity);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <StatusPill
        label={statusLabel}
        tone={tone === "ok" ? "ok" : tone === "danger" ? "danger" : tone === "warn" ? "warn" : "neutral"}
      />
      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] ${statusPillClass("neutral")}`}>
        {finding.category ? formatBoundaryId(finding.category) : finding.rule || "Security"}
      </span>
      <FilePathPill path={finding.filePath} line={finding.line} />
    </div>
  );
}

export default function SecurityGuardPanel({ report }: { report: FirewallReport }) {
  const { repoSlug } = useFirewallView();
  const writeAccess = useGithubRepoWriteAccess(repoSlug);
  const [openedKeys, setOpenedKeys] = useState<ReadonlySet<string>>(() => new Set());
  const [dismissedKeys, setDismissedKeys] = useState<ReadonlySet<string>>(() => new Set());
  const [listFilter, setListFilter] = useState<ListFilter>("all");
  // Drop test/fixture findings — Open Fix refuses them; don't leave them cluttering Leaks.
  const security = report.violations.filter(
    (violation) =>
      violationCategory(violation) !== "ARCHITECTURE" &&
      isActionableSecurityFinding(violation) &&
      !dismissedKeys.has(findingKey(violation))
  );

  useEffect(() => {
    setOpenedKeys(new Set());
    setDismissedKeys(new Set());
    setListFilter("all");
  }, [report.timestamp]);

  function markOpened(key: string) {
    setOpenedKeys((current) => {
      if (current.has(key)) return current;
      const next = new Set(current);
      next.add(key);
      return next;
    });
  }

  function markDismissed(key: string) {
    setDismissedKeys((current) => {
      if (current.has(key)) return current;
      const next = new Set(current);
      next.add(key);
      return next;
    });
  }

  const visible = security.filter((finding) => {
    const opened = openedKeys.has(findingKey(finding));
    if (listFilter === "opened") return opened;
    if (listFilter === "action") return !opened;
    return true;
  });

  return (
    <section className="space-y-4">
      <div className={panelClass}>
        <div className="border-b border-white/[0.06] px-5 py-4">
          <h2 className={sectionLabelClass}>Security posture</h2>
          <p className={`mt-1 ${mutedLabelClass}`}>Active leak and dependency exposures</p>
        </div>
        <dl className="grid grid-cols-1 sm:grid-cols-3">
          {METRICS.map((metric, index) => {
            const rows = findingsFor(report, metric.id);
            const opened = rows.filter((finding) => openedKeys.has(findingKey(finding))).length;
            const active = rows.length - opened;
            const tone = active === 0 ? "ok" : rows.some((f) => f.severity === "CRITICAL") ? "danger" : "warn";
            return (
              <div
                key={metric.id}
                className={`px-5 py-5 ${
                  index < METRICS.length - 1 ? "border-b border-white/[0.06] sm:border-b-0 sm:border-r" : ""
                }`}
              >
                <dt className={mutedLabelClass}>{metric.label}</dt>
                <dd className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-medium tabular-nums tracking-tight text-zinc-50">{active}</span>
                  <StatusPill
                    label={active === 0 ? "Passed" : "Needs review"}
                    tone={tone === "ok" ? "ok" : tone === "danger" ? "danger" : "warn"}
                  />
                </dd>
                {opened > 0 ? (
                  <p className="mt-1 text-xs text-zinc-600">{opened} PR opened</p>
                ) : null}
              </div>
            );
          })}
        </dl>
      </div>

      <div className={panelClass}>
        <div className="flex flex-col gap-3 border-b border-white/[0.06] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className={sectionLabelClass}>Findings</h2>
            <p className={`mt-1 ${mutedLabelClass}`}>
              <span className="tabular-nums text-zinc-300">{security.length}</span> total
            </p>
          </div>
          <div className="flex flex-wrap gap-1" role="group" aria-label="Filter security findings">
            {LIST_FILTERS.map((filter) => {
              const count =
                filter.id === "opened"
                  ? security.filter((finding) => openedKeys.has(findingKey(finding))).length
                  : filter.id === "action"
                    ? security.filter((finding) => !openedKeys.has(findingKey(finding))).length
                    : security.length;
              const selected = listFilter === filter.id;
              return (
                <button
                  key={filter.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setListFilter(filter.id)}
                  className={filterChipClass(selected)}
                >
                  <span>{filter.label}</span>
                  <span className={`tabular-nums ${selected ? "text-zinc-950/60" : "text-zinc-600"}`}>{count}</span>
                </button>
              );
            })}
          </div>
        </div>

        {!writeAccess.loading && !writeAccess.canOpenPullRequest && repoSlug ? (
          <p className="border-b border-amber-400/20 bg-amber-400/5 px-5 py-2.5 text-xs text-amber-100/90" role="status">
            {writeAccess.accessMessage ??
              "Install the Provix GitHub App on this repository to open fix pull requests. Inspect and Copy still work."}
          </p>
        ) : null}

        {security.length === 0 ? (
          <p className="flex items-center gap-2 px-5 py-10 text-sm text-zinc-500">
            <StatusPill label="Passed" tone="ok" />
            No active security findings
          </p>
        ) : visible.length === 0 ? (
          <p className="px-5 py-10 text-sm text-zinc-500">
            {listFilter === "opened" ? "No pull requests opened in this scan." : "No findings need action."}
          </p>
        ) : (
          <ul>
            {visible.map((finding) => {
              const key = findingKey(finding);
              return finding.remediation ? (
                <RemediationDiff
                  key={key}
                  remediation={finding.remediation}
                  onOpened={() => markOpened(key)}
                  onDismissed={() => markDismissed(key)}
                  target={
                    finding.category
                      ? {
                          filePath: finding.filePath,
                          line: finding.line,
                          category: finding.category,
                          snippet: finding.snippet,
                        }
                      : undefined
                  }
                >
                  {({ toolbar, notice, diff, prOpen }) => (
                    <li className={`border-t border-white/[0.04] px-5 py-4 ${rowHoverClass}`}>
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0 space-y-2.5">
                          <FindingMeta finding={finding} prOpen={prOpen} />
                          {prOpen ? (
                            <p className="text-sm text-zinc-500">Fix pull request opened for this finding.</p>
                          ) : (
                            <p className="text-sm leading-relaxed text-zinc-400">{summaryLines(finding.message)}</p>
                          )}
                          {!prOpen && finding.snippet ? <FindingSnippet snippet={finding.snippet} /> : null}
                        </div>
                        <div className="flex shrink-0 lg:justify-end">{toolbar}</div>
                      </div>
                      {notice ? <div className="mt-3">{notice}</div> : null}
                      {diff ? <div className="mt-3">{diff}</div> : null}
                    </li>
                  )}
                </RemediationDiff>
              ) : (
                <li key={key} className={`border-t border-white/[0.04] px-5 py-4 ${rowHoverClass}`}>
                  <div className="space-y-2.5">
                    <FindingMeta finding={finding} />
                    <p className="text-sm leading-relaxed text-zinc-400">{summaryLines(finding.message)}</p>
                    {finding.snippet ? <FindingSnippet snippet={finding.snippet} /> : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
