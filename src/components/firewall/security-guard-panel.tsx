"use client";

import { useEffect, useMemo, useState } from "react";
import type { FirewallPvimFinding, FirewallReport, FirewallViolation } from "@/lib/firewall-contract";
import { isSecurityCategory, violationCategory } from "@/lib/firewall-contract";
import { isActionableSecurityFinding } from "@/lib/firewall-autofix";
import {
  buildPvimFindingViews,
  buildPvimSecurityStatusStrip,
  formatPvimLabel,
  type PvimFindingView,
  type PvimSecurityStatusStrip,
} from "@/lib/pvim/pvim-findings-view";
import { rowDismissActionClass } from "@/components/firewall/finding-diff-drawer";
import { RemediationDiff } from "@/components/firewall/remediation-diff";
import { PvimFixWithPrAction } from "@/components/firewall/pvim-findings-panel";
import { useFirewallView } from "@/components/firewall/firewall-view-context";
import { useGithubRepoWriteAccess } from "@/components/firewall/use-github-repo-write-access";
import Toast from "@/components/Toast";
import { prOpenedToast, useToast } from "@/components/use-toast";
import {
  FilePathPill,
  StatusPill,
  elevatedSurfaceClass,
  filterChipClass,
  findingListClass,
  findingRowClass,
  formatBoundaryId,
  mutedLabelClass,
  panelClass,
  sectionLabelClass,
  severityLabel,
  severityTone,
  statusPillClass,
} from "@/components/firewall/firewall-ui";

const METRICS = [
  { id: "SECRET_LEAK" as const, label: "Secrets" },
  { id: "CLIENT_DB_EXPOSURE" as const, label: "Database exposure" },
  { id: "VULNERABLE_DEPENDENCY" as const, label: "Dependencies" },
  { id: "INSECURE_AUTH_SESSION" as const, label: "Session auth" },
];

const LIST_FILTERS = [
  { id: "action" as const, label: "Open" },
  { id: "opened" as const, label: "PR Opened / Fixed" },
  { id: "all" as const, label: "All" },
];

type ListFilter = (typeof LIST_FILTERS)[number]["id"];

type ProvixRow = {
  kind: "provix";
  key: string;
  finding: FirewallViolation;
};

type PvimRow = {
  kind: "pvim";
  key: string;
  view: PvimFindingView;
  source: FirewallPvimFinding;
};

type SecurityRow = ProvixRow | PvimRow;

function findingKey(finding: FirewallViolation): string {
  return `${finding.category ?? "SECURITY"}:${finding.filePath}:${finding.line}:${finding.message}`;
}

/**
 * Fix-ready rows need a preflight-backed patch and write access.
 * Everything else in Security stays on the list as manual review — no button.
 */
function isListableSecurityFinding(
  finding: FirewallViolation,
  opts: { canOfferFix: boolean; opened: boolean; dismissed: boolean }
): boolean {
  if (violationCategory(finding) === "ARCHITECTURE") return false;
  if (!isSecurityCategory(finding.category)) return false;
  if (opts.dismissed) return false;
  if (!isActionableSecurityFinding(finding)) return true;
  if (!finding.remediation) return false;
  if (!opts.opened && !opts.canOfferFix) return false;
  return true;
}

function summaryLines(message: string): string {
  const trimmed = message.trim().replace(/\s+/g, " ");
  if (trimmed.length <= 160) return trimmed;
  return `${trimmed.slice(0, 157).trimEnd()}…`;
}

function FindingSnippet({ snippet }: { snippet: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-1.5">
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
  const manualReview = !prOpen && finding.autofixable !== true;
  const tone = prOpen ? "ok" : manualReview ? "neutral" : severityTone(finding.severity);
  const statusLabel = prOpen ? "Fixed" : manualReview ? "Manual review" : severityLabel(finding.severity);
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <StatusPill
        label={statusLabel}
        tone={tone === "ok" ? "ok" : tone === "danger" ? "danger" : tone === "warn" ? "warn" : "neutral"}
      />
      <span className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-medium ${statusPillClass("neutral")}`}>
        {finding.category ? formatBoundaryId(finding.category) : finding.rule || "Security"}
      </span>
      <FilePathPill path={finding.filePath} line={finding.line} />
    </div>
  );
}

function PvimFindingMeta({
  view,
  prOpen,
}: {
  view: PvimFindingView;
  prOpen?: boolean;
}) {
  const manualReview = !prOpen && !view.offerFixWithPr;
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <StatusPill
        label={prOpen ? "Fixed" : manualReview ? "Manual review" : "Open"}
        tone={prOpen ? "ok" : manualReview ? "neutral" : "warn"}
      />
      <span className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-medium ${statusPillClass("info")}`}>
        PVIM
      </span>
      <span className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-medium ${statusPillClass("neutral")}`}>
        {view.label}
      </span>
      {view.filePath ? (
        <FilePathPill path={view.filePath} line={view.line ?? undefined} />
      ) : (
        <span className={mutedLabelClass}>No file location</span>
      )}
    </div>
  );
}

/** Compact header strip — analysis/advisory honesty only; never lists findings. */
export function PvimStatusIndicator({ strip }: { strip: PvimSecurityStatusStrip }) {
  if (!strip.visible) return null;
  return (
    <div
      className="flex flex-col gap-1 border-b border-zinc-800/60 bg-white/[0.015] px-5 py-2.5 sm:flex-row sm:items-center sm:justify-between"
      role="status"
      aria-label={strip.summary}
      data-testid="pvim-security-status"
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className={mutedLabelClass}>PVIM</span>
        <StatusPill label={strip.analysisLabel} tone={strip.analysisTone} />
        {strip.advisory ? (
          <StatusPill label={strip.advisory.label} tone={strip.advisory.tone} />
        ) : null}
      </div>
      <p className="text-[11px] leading-snug text-zinc-600 sm:max-w-md sm:text-right">{strip.disclaimer}</p>
    </div>
  );
}

/** Boilerplate copy stays collapsed until row hover or explicit expand. */
function FindingDescription({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="min-w-0">
      {!expanded ? (
        <button
          type="button"
          className="text-[11px] text-zinc-600 transition-colors hover:text-zinc-400 group-hover/row:hidden"
          aria-expanded={false}
          onClick={() => setExpanded(true)}
        >
          Details
        </button>
      ) : null}
      <div className={expanded ? "block" : "hidden group-hover/row:block"}>
        <p className="text-[13px] leading-snug text-zinc-500">{text}</p>
        {expanded ? (
          <button
            type="button"
            className="mt-1 text-[11px] text-zinc-600 transition-colors hover:text-zinc-400"
            aria-expanded
            onClick={() => setExpanded(false)}
          >
            Hide details
          </button>
        ) : null}
      </div>
    </div>
  );
}

function matchesListFilter(opened: boolean, listFilter: ListFilter): boolean {
  if (listFilter === "opened") return opened;
  if (listFilter === "action") return !opened;
  return true;
}

export default function SecurityGuardPanel({ report }: { report: FirewallReport }) {
  const { repoSlug } = useFirewallView();
  const writeAccess = useGithubRepoWriteAccess(repoSlug);
  const { showToast, toast } = useToast();
  const [openedKeys, setOpenedKeys] = useState<ReadonlySet<string>>(() => new Set());
  const [dismissedKeys, setDismissedKeys] = useState<ReadonlySet<string>>(() => new Set());
  const [listFilter, setListFilter] = useState<ListFilter>("action");
  const canOfferFix = !writeAccess.loading && writeAccess.canOpenPullRequest;

  function handleSecurityPrOpened(key: string, pull: { url: string; number: number }) {
    markOpened(key);
    // Same Toast + prOpenedToast path as Structure (firewall-violations-table).
    showToast(prOpenedToast(pull));
  }
  const commitSha =
    typeof report.commitSha === "string" && report.commitSha.trim() ? report.commitSha.trim() : null;

  // Only rows with a real Open Fix path (or an already-opened PR). No Preview-only zombies.
  const security = useMemo(
    () =>
      report.violations.filter((violation) => {
        const key = findingKey(violation);
        return isListableSecurityFinding(violation, {
          canOfferFix,
          opened: openedKeys.has(key),
          dismissed: dismissedKeys.has(key),
        });
      }),
    [report.violations, canOfferFix, openedKeys, dismissedKeys]
  );

  // Shadow findings stay out of Provix scoring (`violations`) but render in the same list UI.
  const pvimRows = useMemo((): PvimRow[] => {
    const sources = report.pvimFindings ?? [];
    if (sources.length === 0) return [];
    const views = buildPvimFindingViews(sources, report);
    const rows: PvimRow[] = [];
    for (let index = 0; index < views.length; index += 1) {
      const view = views[index]!;
      const source = sources[index]!;
      if (dismissedKeys.has(view.key)) continue;
      // Skip explicit "safe" rows — they are not actionable findings.
      if (source.label.trim().toLowerCase() === "safe") continue;
      rows.push({ kind: "pvim", key: view.key, view, source });
    }
    return rows;
  }, [report, dismissedKeys]);

  const rows = useMemo((): SecurityRow[] => {
    const provix: ProvixRow[] = security.map((finding) => ({
      kind: "provix",
      key: findingKey(finding),
      finding,
    }));
    return [...provix, ...pvimRows];
  }, [security, pvimRows]);

  useEffect(() => {
    setOpenedKeys(new Set());
    setDismissedKeys(new Set());
    setListFilter("action");
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

  const visible = rows.filter((row) => matchesListFilter(openedKeys.has(row.key), listFilter));
  const openedCount = rows.filter((row) => openedKeys.has(row.key)).length;
  const openCount = rows.length - openedCount;
  const pvimStatus = useMemo(() => buildPvimSecurityStatusStrip(report), [report]);

  return (
    <section className="space-y-4">
      <div className={`${elevatedSurfaceClass} overflow-hidden`}>
        <div className="border-b border-zinc-800/60 px-5 py-4">
          <h2 className={sectionLabelClass}>Security</h2>
          <p className={`mt-1 ${mutedLabelClass}`}>Fixable leak and dependency exposures</p>
        </div>
        <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {METRICS.map((metric, index) => {
            const metricRows = security.filter((finding) => finding.category === metric.id);
            const opened = metricRows.filter((finding) => openedKeys.has(findingKey(finding))).length;
            const active = metricRows.length - opened;
            const tone = active === 0 ? "ok" : metricRows.some((f) => f.severity === "CRITICAL") ? "danger" : "warn";
            return (
              <div
                key={metric.id}
                className={`px-5 py-5 ${
                  index < METRICS.length - 1 ? "border-b border-zinc-800/60 sm:border-b-0 sm:border-r" : ""
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
        <div className="flex flex-col gap-3 border-b border-zinc-800/60 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className={sectionLabelClass}>Security findings</h2>
            <p className={`mt-1 ${mutedLabelClass}`}>
              Fix with PR only appears after the patch passes the same typecheck as opening the pull request.
              Other rows stay on manual review.{" "}
              <span className="tabular-nums text-zinc-300">{rows.length}</span> total
            </p>
          </div>
          {rows.length > 0 ? (
            <div className="flex flex-wrap gap-1" role="group" aria-label="Filter security findings">
              {LIST_FILTERS.map((filter) => {
                const count =
                  filter.id === "opened" ? openedCount : filter.id === "action" ? openCount : rows.length;
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
          ) : null}
        </div>

        <PvimStatusIndicator strip={pvimStatus} />

        {!writeAccess.loading && !writeAccess.canOpenPullRequest && repoSlug ? (
          <p className="border-b border-amber-400/20 bg-amber-400/5 px-5 py-2.5 text-xs text-amber-100/90" role="status">
            {writeAccess.accessMessage ??
              "Install the Provix GitHub App on this repository to open fix pull requests."}
          </p>
        ) : null}

        {writeAccess.loading && repoSlug ? (
          <p className="px-5 py-10 text-sm text-zinc-500">Checking whether Provix can open fix pull requests…</p>
        ) : rows.length === 0 ? (
          <p className="flex items-center gap-2 px-5 py-10 text-sm text-zinc-500">
            {!writeAccess.canOpenPullRequest && repoSlug ? (
              "No fixable security findings to show until the GitHub App can open pull requests."
            ) : (
              <>
                <StatusPill label="Passed" tone="ok" />
                No security findings
              </>
            )}
          </p>
        ) : visible.length === 0 ? (
          <p className="px-5 py-10 text-sm text-zinc-500">
            {listFilter === "opened"
              ? "No pull requests opened in this scan."
              : listFilter === "action"
                ? "No open findings."
                : "No findings in this filter."}
          </p>
        ) : (
          <ul className={findingListClass}>
            {visible.map((row) => {
              if (row.kind === "pvim") {
                const { view, source, key } = row;
                const prOpen = openedKeys.has(key);
                const detail =
                  view.message ??
                  (view.remediation.explanation
                    ? summaryLines(view.remediation.explanation)
                    : formatPvimLabel(source.ruleId));
                return (
                  <li key={key} className={findingRowClass}>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <PvimFindingMeta view={view} prOpen={prOpen} />
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                        {view.offerFixWithPr && commitSha ? (
                          <PvimFixWithPrAction
                            finding={source}
                            commitSha={commitSha}
                            onOpened={(pull) => handleSecurityPrOpened(key, pull)}
                          />
                        ) : null}
                        {!prOpen ? (
                          <button
                            type="button"
                            onClick={() => markDismissed(key)}
                            className={rowDismissActionClass}
                            title="Dismiss this finding from the Open queue"
                          >
                            Dismiss
                          </button>
                        ) : null}
                      </div>
                    </div>
                    {!prOpen ? (
                      <div className="mt-1.5 space-y-1.5">
                        <FindingDescription text={detail} />
                        {view.snippet ? <FindingSnippet snippet={view.snippet} /> : null}
                      </div>
                    ) : null}
                  </li>
                );
              }

              const { finding, key } = row;
              const remediation = finding.remediation;
              if (!remediation || !finding.category) {
                return (
                  <li key={key} className={findingRowClass}>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 space-y-1.5">
                        <FindingMeta finding={finding} />
                        <FindingDescription text={summaryLines(finding.message)} />
                        {finding.snippet ? <FindingSnippet snippet={finding.snippet} /> : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => markDismissed(key)}
                        className={`${rowDismissActionClass} shrink-0 self-start`}
                        title="Dismiss this finding from the Open queue"
                      >
                        Dismiss
                      </button>
                    </div>
                  </li>
                );
              }
              return (
                <RemediationDiff
                  key={key}
                  remediation={remediation}
                  offerFix={isActionableSecurityFinding(finding)}
                  onOpened={(pull) => handleSecurityPrOpened(key, pull)}
                  onDismissed={() => markDismissed(key)}
                  target={{
                    filePath: finding.filePath,
                    line: finding.line,
                    // Guaranteed by isListableSecurityFinding
                    category: finding.category!,
                    snippet: finding.snippet,
                  }}
                >
                  {({ toolbar, notice, diff, prOpen }) => (
                    <li className={findingRowClass}>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <FindingMeta finding={finding} prOpen={prOpen} />
                        </div>
                        <div className="flex shrink-0 sm:justify-end">{toolbar}</div>
                      </div>
                      {!prOpen ? (
                        <div className="mt-1.5 space-y-1.5">
                          <FindingDescription text={summaryLines(finding.message)} />
                          {finding.snippet ? <FindingSnippet snippet={finding.snippet} /> : null}
                        </div>
                      ) : null}
                      {notice ? <div className="mt-2">{notice}</div> : null}
                      {diff ? <div className="mt-2">{diff}</div> : null}
                    </li>
                  )}
                </RemediationDiff>
              );
            })}
          </ul>
        )}
      </div>

      <Toast {...toast} />
    </section>
  );
}
