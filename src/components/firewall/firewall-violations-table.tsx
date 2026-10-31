"use client";

import { useEffect, useMemo, useState } from "react";
import { useFirewallView } from "@/components/firewall/firewall-view-context";
import {
  FilePathPill,
  StatusPill,
  filterChipClass,
  formatBoundaryId,
  mutedLabelClass,
  panelClass,
  rowGhostActionClass,
  rowHoverClass,
  rowPrimaryActionClass,
  sectionLabelClass,
  severityLabel,
  severityTone,
  statusPillClass,
  tableCellClass,
  tableHeadClass,
} from "@/components/firewall/firewall-ui";
import { OpenFixPrButton } from "@/components/firewall/open-fix-pr-button";
import Toast from "@/components/Toast";
import { prOpenedToast, useToast } from "@/components/use-toast";
import {
  FIREWALL_SEVERITIES,
  violationCategory,
  type FirewallAutofixPullRequestResponse,
  type FirewallAutofixResponse,
  type FirewallReport,
  type FirewallResolvedFilesResponse,
  type FirewallResolvedPull,
  type FirewallSeverity,
  type FirewallViolation,
} from "@/lib/firewall-contract";
import { isActionableArchitectureViolation, isTestSourcePath } from "@/lib/firewall-autofix";
import { toGitHubOwnerRepo } from "@/lib/github-repo-ref";
import { readJsonResponse } from "@/lib/read-json-response";

type SeverityFilter = "ALL" | FirewallSeverity;
type ListFilter = "all" | "action" | "opened";

type DiffCache =
  | { status: "loading" }
  | { status: "ready"; summary: string; diff: string }
  | { status: "error"; message: string };

type SessionPull =
  | { status: "opening" }
  | { status: "opened"; url: string; number: number }
  | { status: "error"; message: string };

const FILTERS: SeverityFilter[] = ["ALL", ...FIREWALL_SEVERITIES];
const LIST_FILTERS: { id: ListFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "action", label: "Needs action" },
  { id: "opened", label: "PR opened" },
];

function summaryLines(message: string): string {
  const trimmed = message.trim().replace(/\s+/g, " ");
  if (trimmed.length <= 140) return trimmed;
  return `${trimmed.slice(0, 137).trimEnd()}…`;
}

/** Lower weight sorts first: Critical → High → Medium → Low. */
function severityWeight(severity: FirewallSeverity | string): number {
  switch (severity) {
    case "CRITICAL":
      return 0;
    case "HIGH":
      return 1;
    case "MEDIUM":
      return 2;
    case "LOW":
      return 3;
    default:
      return 4;
  }
}

function matchesListFilter(
  opened: boolean,
  listFilter: ListFilter
): boolean {
  if (listFilter === "opened") return opened;
  if (listFilter === "action") return !opened;
  return true;
}

function countFor(
  violations: FirewallViolation[],
  filter: SeverityFilter,
  isOpen: (filePath: string) => boolean,
  listFilter: ListFilter
): number {
  let count = 0;
  for (const violation of violations) {
    if (!matchesListFilter(isOpen(violation.filePath), listFilter)) continue;
    if (filter !== "ALL" && violation.severity !== filter) continue;
    count += 1;
  }
  return count;
}

function compareArchitectureViolations(
  left: FirewallViolation,
  right: FirewallViolation,
  isOpen: (filePath: string) => boolean
): number {
  const leftResolved = isOpen(left.filePath) ? 1 : 0;
  const rightResolved = isOpen(right.filePath) ? 1 : 0;
  if (leftResolved !== rightResolved) return leftResolved - rightResolved;

  const bySeverity = severityWeight(left.severity) - severityWeight(right.severity);
  if (bySeverity !== 0) return bySeverity;

  const byPath = left.filePath.localeCompare(right.filePath);
  if (byPath !== 0) return byPath;
  return left.line - right.line;
}

function violationKey(violation: FirewallViolation): string {
  return `${violation.filePath}:${violation.line}:${violation.severity}:${violation.message}`;
}

function lacksWriteAccess(status: number, message: string): boolean {
  if (status === 401 || status === 403) return true;
  return /GITHUB_TOKEN|cannot create a branch|permission/i.test(message);
}

function recordedPulls(payload: FirewallResolvedFilesResponse): Record<string, FirewallResolvedPull> {
  const pulls = payload.pulls ?? payload.filePaths.map((filePath) => ({ filePath, number: null, url: null }));
  const next: Record<string, FirewallResolvedPull> = {};
  for (const pull of pulls) next[pull.filePath] = pull;
  return next;
}

export default function FirewallViolationsTable({
  report,
  repoUrl = null,
}: {
  report: FirewallReport;
  repoUrl?: string | null;
}) {
  const { setActiveView } = useFirewallView();
  const { showToast, toast } = useToast();
  const [filter, setFilter] = useState<SeverityFilter>("ALL");
  const [listFilter, setListFilter] = useState<ListFilter>("all");
  const [recorded, setRecorded] = useState<Record<string, FirewallResolvedPull>>({});
  const [diffs, setDiffs] = useState<Record<string, DiffCache>>({});
  const [openDiffs, setOpenDiffs] = useState<ReadonlySet<string>>(() => new Set());
  const [sessionPulls, setSessionPulls] = useState<Record<string, SessionPull>>({});
  const repoSlug = repoUrl ? toGitHubOwnerRepo(repoUrl) : null;
  const architecture = useMemo(
    () =>
      report.violations.filter(
        (violation) =>
          violationCategory(violation) === "ARCHITECTURE" && isActionableArchitectureViolation(violation)
      ),
    [report.violations]
  );
  const securityCount = report.violations.filter(
    (violation) => violationCategory(violation) !== "ARCHITECTURE"
  ).length;

  function violationHasOpenPr(filePath: string): boolean {
    const session = sessionPulls[filePath];
    if (session?.status === "opened") return true;
    return Boolean(recorded[filePath]);
  }

  const sortedArchitecture = useMemo(
    () =>
      [...architecture].sort((left, right) =>
        compareArchitectureViolations(left, right, violationHasOpenPr)
      ),
    // sessionPulls / recorded change which rows count as resolved.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [architecture, recorded, sessionPulls]
  );
  const severityRows = useMemo(
    () =>
      filter === "ALL"
        ? sortedArchitecture
        : sortedArchitecture.filter((violation) => violation.severity === filter),
    [sortedArchitecture, filter]
  );
  const rows = useMemo(
    () =>
      severityRows.filter((violation) =>
        matchesListFilter(violationHasOpenPr(violation.filePath), listFilter)
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [severityRows, listFilter, recorded, sessionPulls]
  );
  const openedCount = sortedArchitecture.filter((violation) =>
    violationHasOpenPr(violation.filePath)
  ).length;
  const activeCount = sortedArchitecture.length - openedCount;

  useEffect(() => {
    setDiffs({});
    setOpenDiffs(new Set());
    setSessionPulls({});
    setListFilter("all");
  }, [report.timestamp]);

  useEffect(() => {
    if (!repoSlug) {
      setRecorded({});
      return;
    }
    let active = true;
    void (async () => {
      try {
        const response = await fetch(`/api/firewall/autofix/pr?repo=${encodeURIComponent(repoSlug)}`);
        const payload = await readJsonResponse<FirewallResolvedFilesResponse>(response);
        if (!active || !response.ok || !payload.ok) return;
        setRecorded(recordedPulls(payload));
      } catch {
        // Keep pull requests already shown in this session.
      }
    })();
    return () => {
      active = false;
    };
  }, [repoSlug]);

  async function toggleDiff(key: string, filePath: string) {
    if (openDiffs.has(key)) {
      setOpenDiffs((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
      return;
    }

    const cached = diffs[filePath];
    if (cached?.status === "ready") {
      setOpenDiffs((current) => new Set(current).add(key));
      return;
    }
    if (cached?.status === "loading") return;

    setDiffs((prev) => ({ ...prev, [filePath]: { status: "loading" } }));
    try {
      const response = await fetch("/api/firewall/autofix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filePath,
          ...(repoSlug ? { repoUrl: repoSlug } : {}),
        }),
      });
      const payload = await readJsonResponse<FirewallAutofixResponse>(response);
      if (!response.ok || !payload.ok) {
        setDiffs((prev) => ({
          ...prev,
          [filePath]: { status: "error", message: payload.message ?? "The diff could not be prepared." },
        }));
        return;
      }
      setDiffs((prev) => ({
        ...prev,
        [filePath]: {
          status: "ready",
          summary: payload.summary?.trim() || "Diff ready.",
          diff: payload.diff ?? "",
        },
      }));
      setOpenDiffs((current) => new Set(current).add(key));
    } catch (error) {
      setDiffs((prev) => ({
        ...prev,
        [filePath]: {
          status: "error",
          message: error instanceof Error ? error.message : "The diff could not be prepared.",
        },
      }));
    }
  }

  async function openFixPr(filePath: string) {
    const current = sessionPulls[filePath];
    if (current?.status === "opening" || current?.status === "opened" || recorded[filePath]) return;
    if (isTestSourcePath(filePath)) {
      setSessionPulls((prev) => ({
        ...prev,
        [filePath]: {
          status: "error",
          message:
            "Test files cannot be auto-split. Shared helpers break across modules and CI fails typecheck (see PR #70).",
        },
      }));
      return;
    }
    if (!repoSlug) {
      setSessionPulls((prev) => ({
        ...prev,
        [filePath]: { status: "error", message: "Scan a GitHub repository before opening a pull request." },
      }));
      return;
    }

    setSessionPulls((prev) => ({ ...prev, [filePath]: { status: "opening" } }));
    try {
      const response = await fetch("/api/firewall/autofix/pr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filePath, repoUrl: repoSlug }),
      });
      const payload = await readJsonResponse<FirewallAutofixPullRequestResponse>(response);
      const message = payload.message ?? "The pull request could not be opened.";
      if (lacksWriteAccess(response.status, message)) {
        const ready = diffs[filePath];
        let copied = false;
        if (ready?.status === "ready") {
          try {
            await navigator.clipboard.writeText(ready.diff);
            copied = true;
          } catch {
            copied = false;
          }
        }
        setSessionPulls((prev) => ({
          ...prev,
          [filePath]: {
            status: "error",
            message: copied
              ? `${message} The patch was copied to your clipboard.`
              : `${message} View Diff is still available.`,
          },
        }));
        return;
      }
      if (!response.ok || !payload.ok || !payload.url || typeof payload.number !== "number") {
        setSessionPulls((prev) => ({ ...prev, [filePath]: { status: "error", message } }));
        return;
      }
      const opened = { url: payload.url, number: payload.number };
      setSessionPulls((prev) => ({ ...prev, [filePath]: { status: "opened", ...opened } }));
      setRecorded((prev) => ({ ...prev, [filePath]: { filePath, ...opened } }));
      showToast(prOpenedToast(opened));
    } catch (error) {
      setSessionPulls((prev) => ({
        ...prev,
        [filePath]: {
          status: "error",
          message: error instanceof Error ? error.message : "The pull request could not be opened.",
        },
      }));
    }
  }

  return (
    <section className="space-y-4">
      <div className={panelClass}>
        <div className="flex flex-col gap-4 border-b border-white/[0.06] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 className={sectionLabelClass}>Architecture violations</h2>
            <p className={`mt-1 ${mutedLabelClass}`}>
              <span className="tabular-nums text-zinc-300">{activeCount.toLocaleString("en-US")}</span>
              {activeCount === 1 ? " needs action" : " need action"}
              {openedCount > 0 ? (
                <>
                  <span className="text-zinc-700"> · </span>
                  <span className="tabular-nums text-zinc-300">{openedCount.toLocaleString("en-US")}</span> PR open
                </>
              ) : null}
            </p>
          </div>
          <div className="flex flex-wrap gap-1" role="group" aria-label="Filter violations by severity">
            {FILTERS.map((item) => {
              const active = item === filter;
              const shown = countFor(sortedArchitecture, item, violationHasOpenPr, listFilter);
              return (
                <button
                  key={item}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setFilter(item)}
                  className={filterChipClass(active)}
                >
                  <span>{item === "ALL" ? "All" : severityLabel(item)}</span>
                  <span className={`tabular-nums ${active ? "text-zinc-950/60" : "text-zinc-600"}`}>{shown}</span>
                </button>
              );
            })}
          </div>
        </div>

        {securityCount > 0 ? (
          <div className="flex flex-col gap-2 border-b border-white/[0.06] px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-zinc-500">
              <span className="tabular-nums text-zinc-300">{securityCount.toLocaleString("en-US")}</span>
              {securityCount === 1 ? " security finding" : " security findings"} live in Leaks
            </p>
            <button
              type="button"
              onClick={() => setActiveView("leaks")}
              className="inline-flex w-fit items-center rounded-md px-2.5 py-1 text-xs text-zinc-400 transition-colors hover:bg-white/[0.04] hover:text-zinc-200"
            >
              Open Leaks
            </button>
          </div>
        ) : null}

        {sortedArchitecture.length > 0 ? (
          <div className="flex flex-wrap gap-1 border-b border-white/[0.06] px-5 py-3" role="group" aria-label="Filter architecture violations">
            {LIST_FILTERS.map((item) => {
              const count = countFor(sortedArchitecture, filter, violationHasOpenPr, item.id);
              const selected = listFilter === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setListFilter(item.id)}
                  className={filterChipClass(selected)}
                >
                  <span>{item.label}</span>
                  <span className={`tabular-nums ${selected ? "text-zinc-950/60" : "text-zinc-600"}`}>{count}</span>
                </button>
              );
            })}
          </div>
        ) : null}

        {rows.length === 0 ? (
          <p className="px-5 py-10 text-sm text-zinc-500">
            {listFilter === "opened"
              ? "No pull requests opened in this scan."
              : listFilter === "action"
                ? "No autofixable architecture issues need action."
                : "No autofixable architecture issues in this filter."}
          </p>
        ) : (
          <ul>
            {rows.map((violation) => {
              const key = violationKey(violation);
              const diff = diffs[violation.filePath];
              const diffOpen = openDiffs.has(key) && diff?.status === "ready";
              const session = sessionPulls[violation.filePath];
              const saved = recorded[violation.filePath];
              const opened =
                session?.status === "opened"
                  ? session
                  : saved && typeof saved.number === "number" && saved.url
                    ? { url: saved.url, number: saved.number }
                    : null;
              const opening = session?.status === "opening";
              const prError = session?.status === "error" ? session.message : null;
              const knownOpen = Boolean(saved);
              const resolved = Boolean(opened || knownOpen);
              const tone = resolved ? "ok" : severityTone(violation.severity);
              const ruleLabel = violation.rule ? formatBoundaryId(violation.rule) : "Architecture";
              return (
                <li key={key} className={`border-t border-white/[0.04] px-5 py-4 ${rowHoverClass}`}>
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 space-y-2.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusPill
                          label={resolved ? "Fixed" : severityLabel(violation.severity)}
                          tone={tone === "ok" ? "ok" : tone === "danger" ? "danger" : tone === "warn" ? "warn" : "neutral"}
                        />
                        <span
                          className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] ${statusPillClass("neutral")}`}
                        >
                          {ruleLabel}
                        </span>
                        <FilePathPill path={violation.filePath} line={resolved ? undefined : violation.line} />
                      </div>
                      <p className="text-sm leading-relaxed text-zinc-400">
                        {resolved ? "Fix pull request opened for this finding." : summaryLines(violation.message)}
                      </p>
                      {!resolved && violation.snippet ? (
                        <details className="group/snippet">
                          <summary className="cursor-pointer list-none text-xs text-zinc-500 transition-colors hover:text-zinc-300 [&::-webkit-details-marker]:hidden">
                            Inspect code
                          </summary>
                          <pre className="mt-2 max-h-48 overflow-auto rounded-lg border border-white/[0.06] bg-black/50 px-3 py-2.5 font-mono text-[11px] leading-relaxed text-zinc-400">
                            <code>{violation.snippet}</code>
                          </pre>
                        </details>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                      <button
                        type="button"
                        aria-expanded={diffOpen}
                        disabled={diff?.status === "loading"}
                        onClick={() => void toggleDiff(key, violation.filePath)}
                        className={rowGhostActionClass}
                      >
                        {diff?.status === "loading" ? "Loading…" : diffOpen ? "Hide" : "View Diff"}
                      </button>
                      {opened ? (
                        <a
                          href={opened.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-300 transition-colors hover:bg-emerald-500/15"
                        >
                          PR #{opened.number}
                        </a>
                      ) : knownOpen ? (
                        <StatusPill label="Opened" tone="ok" />
                      ) : (
                        <OpenFixPrButton
                          opening={opening}
                          onClick={() => void openFixPr(violation.filePath)}
                          className={rowPrimaryActionClass}
                        />
                      )}
                    </div>
                  </div>
                  {prError || diff?.status === "error" || (diffOpen && diff?.status === "ready") ? (
                    <div className="mt-3 space-y-2">
                      {prError ? (
                        <p className="text-sm text-red-300" role="alert">
                          {prError}
                        </p>
                      ) : null}
                      {diff?.status === "error" ? (
                        <p className="text-sm text-red-300" role="alert">
                          {diff.message}
                        </p>
                      ) : null}
                      {diffOpen && diff?.status === "ready" ? (
                        <div className="overflow-hidden rounded-lg border border-white/[0.06] bg-black/40">
                          <p className="border-b border-white/[0.06] px-3 py-2 text-xs text-zinc-500">{diff.summary}</p>
                          <pre className="max-h-48 overflow-auto px-3 py-2 font-mono text-[11px] leading-relaxed text-zinc-400">
                            <code>{diff.diff || "(empty diff)"}</code>
                          </pre>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className={panelClass}>
        <div className="border-b border-white/[0.06] px-5 py-4">
          <h2 className={sectionLabelClass}>Largest files</h2>
          <p className={`mt-1 ${mutedLabelClass}`}>Top files by line count in this snapshot</p>
        </div>
        {report.largestFiles.length === 0 ? (
          <p className="px-5 py-8 text-sm text-zinc-500">No file sizes were recorded.</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className={tableHeadClass}>
                <th className="w-12 px-5 py-2.5 font-medium">#</th>
                <th className="px-4 py-2.5 font-medium">File</th>
                <th className="px-5 py-2.5 text-right font-medium">Lines</th>
              </tr>
            </thead>
            <tbody>
              {report.largestFiles.map((file, index) => (
                <tr key={file.filePath} className={`border-t border-white/[0.04] ${rowHoverClass}`}>
                  <td className={`${tableCellClass} px-5 tabular-nums text-zinc-600`}>{index + 1}</td>
                  <td className={`${tableCellClass} max-w-[28rem] truncate font-mono text-xs text-zinc-200`}>
                    {file.filePath}
                  </td>
                  <td className={`${tableCellClass} px-5 text-right tabular-nums text-zinc-400`}>
                    {file.lineCount.toLocaleString("en-US")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Toast {...toast} />
    </section>
  );
}
