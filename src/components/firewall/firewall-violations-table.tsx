"use client";

import { useMemo, useState } from "react";
import {
  FIREWALL_SEVERITIES,
  type FirewallAutofixPullRequestResponse,
  type FirewallAutofixResponse,
  type FirewallReport,
  type FirewallSeverity,
  type FirewallViolation,
} from "@/lib/firewall-contract";
import { toGitHubOwnerRepo } from "@/lib/github-repo-ref";
import { readJsonResponse } from "@/lib/read-json-response";

type SeverityFilter = "ALL" | FirewallSeverity;
type RowFix =
  | { status: "idle" }
  | { status: "refactoring" }
  | { status: "done"; summary: string; diff: string; canPullRequest: boolean; prError?: string }
  | { status: "opening"; summary: string; diff: string }
  | { status: "pr"; summary: string; diff: string; url: string; number: number }
  | { status: "error"; message: string };

const FILTERS: SeverityFilter[] = ["ALL", ...FIREWALL_SEVERITIES];

const BADGE: Record<FirewallSeverity, string> = {
  CRITICAL: "bg-rose-500/15 text-rose-200 ring-rose-400/35",
  HIGH: "bg-orange-500/15 text-orange-200 ring-orange-400/35",
  MEDIUM: "bg-amber-400/15 text-amber-100 ring-amber-300/35",
  LOW: "bg-zinc-500/20 text-zinc-300 ring-white/10",
};

function countFor(report: FirewallReport, filter: SeverityFilter): number {
  if (filter === "ALL") return report.violations.length;
  return report.violations.filter((violation) => violation.severity === filter).length;
}

function violationKey(violation: FirewallViolation): string {
  return `${violation.filePath}:${violation.line}:${violation.severity}:${violation.message}`;
}

function actionLabel(fix: RowFix | undefined): string {
  if (fix?.status === "refactoring") return "Working...";
  if (fix?.status === "done" || fix?.status === "opening" || fix?.status === "pr") return "Diff ready";
  if (fix?.status === "error") return "Retry";
  return "Auto-Fix";
}

function previewOf(fix: RowFix | undefined): { summary: string; diff: string } | null {
  if (fix?.status === "done" || fix?.status === "opening" || fix?.status === "pr") return fix;
  return null;
}

export default function FirewallViolationsTable({
  report,
  repoUrl = null,
}: {
  report: FirewallReport;
  repoUrl?: string | null;
}) {
  const [filter, setFilter] = useState<SeverityFilter>("ALL");
  const [fixes, setFixes] = useState<Record<string, RowFix>>({});
  const repoSlug = repoUrl ? toGitHubOwnerRepo(repoUrl) : null;

  async function refactorFile(key: string, filePath: string) {
    const current = fixes[key];
    if (current?.status === "refactoring" || current?.status === "done") return;

    setFixes((prev) => ({ ...prev, [key]: { status: "refactoring" } }));
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
        setFixes((prev) => ({
          ...prev,
          [key]: { status: "error", message: payload.message ?? "Auto-Fix failed." },
        }));
        return;
      }

      const summary = payload.summary?.trim() || "Auto-Fix completed.";
      const diff = payload.diff ?? "";
      setFixes((prev) => ({
        ...prev,
        [key]: {
          status: "done",
          summary,
          diff,
          canPullRequest: Boolean(payload.canOpenPullRequest && repoSlug),
        },
      }));
    } catch (error) {
      setFixes((prev) => ({
        ...prev,
        [key]: {
          status: "error",
          message: error instanceof Error ? error.message : "Auto-Fix failed.",
        },
      }));
    }
  }

  async function openPullRequest(key: string, filePath: string) {
    const current = fixes[key];
    if (!repoSlug || current?.status !== "done" || !current.canPullRequest) return;
    const { summary, diff } = current;
    setFixes((prev) => ({ ...prev, [key]: { status: "opening", summary, diff } }));
    try {
      const response = await fetch("/api/firewall/autofix/pr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filePath, repoUrl: repoSlug }),
      });
      const payload = await readJsonResponse<FirewallAutofixPullRequestResponse>(response);
      const pullUrl = payload.url;
      const pullNumber = payload.number;
      if (!response.ok || !payload.ok || !pullUrl || typeof pullNumber !== "number") {
        setFixes((prev) => ({
          ...prev,
          [key]: {
            status: "done",
            summary,
            diff,
            canPullRequest: true,
            prError: payload.message ?? "The pull request could not be opened.",
          },
        }));
        return;
      }
      setFixes((prev) => ({
        ...prev,
        [key]: { status: "pr", summary, diff, url: pullUrl, number: pullNumber },
      }));
    } catch (error) {
      setFixes((prev) => ({
        ...prev,
        [key]: {
          status: "done",
          summary,
          diff,
          canPullRequest: true,
          prError: error instanceof Error ? error.message : "The pull request could not be opened.",
        },
      }));
    }
  }

  const rows = useMemo(
    () =>
      filter === "ALL"
        ? report.violations
        : report.violations.filter((violation) => violation.severity === filter),
    [filter, report.violations]
  );

  return (
    <section className="space-y-5">
      <div>
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold tracking-tight text-white">Violations</h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              <span className="tabular-nums text-zinc-300">{rows.length.toLocaleString("en-US")}</span> shown
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter violations by severity">
            {FILTERS.map((item) => {
              const active = item === filter;
              const count = countFor(report, item);
              return (
                <button
                  key={item}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setFilter(item)}
                  className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-semibold tracking-wide transition-colors ${
                    active
                      ? "bg-white text-black"
                      : "bg-neutral-900 text-zinc-400 ring-1 ring-neutral-700 hover:bg-neutral-800 hover:text-zinc-200"
                  }`}
                >
                  <span>{item}</span>
                  <span className={`tabular-nums ${active ? "text-black/70" : "text-zinc-500"}`}>{count}</span>
                </button>
              );
            })}
          </div>
        </div>

        {rows.length === 0 ? (
          <p className="rounded-lg border border-neutral-800 bg-neutral-900/50 px-4 py-10 text-sm text-zinc-500">
            No violations in this filter.
          </p>
        ) : (
          <ul className="space-y-2.5">
            {rows.map((violation) => {
              const key = violationKey(violation);
                  const fix = fixes[key];
                  const busy = fix?.status === "refactoring" || fix?.status === "opening";
                  const settled = fix?.status === "done" || fix?.status === "opening" || fix?.status === "pr";
                  const preview = previewOf(fix);
                  return (
                <li
                  key={key}
                  aria-busy={busy}
                  className="rounded-lg border border-neutral-800 bg-[#12141A] p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ${BADGE[violation.severity]}`}
                        >
                          {violation.severity}
                        </span>
                        <span className="font-mono text-[11px] tabular-nums text-zinc-500">
                          L{violation.line}
                        </span>
                        <span className="text-[11px] font-medium text-zinc-400">{violation.rule}</span>
                      </div>
                      <p className="break-all font-mono text-[13px] leading-snug text-zinc-50 sm:truncate sm:break-normal">
                        {violation.filePath}
                      </p>
                      <p className="text-sm leading-relaxed text-zinc-400">{violation.message}</p>
                      {fix?.status === "refactoring" ? (
                        <p className="text-xs font-medium text-violet-300" role="status">
                          Refactoring file...
                        </p>
                      ) : null}
                      {fix?.status === "opening" ? (
                        <p className="text-xs font-medium text-violet-300" role="status">
                          Opening pull request...
                        </p>
                      ) : null}
                      {preview ? (
                        <div className="space-y-2 pt-1" role="status">
                          <p className="text-xs font-medium text-emerald-300">{preview.summary}</p>
                          <pre className="max-h-48 overflow-auto rounded-md border border-neutral-800 bg-black/50 p-3 font-mono text-[11px] leading-relaxed text-zinc-300">
                            {preview.diff || "(empty diff)"}
                          </pre>
                          {fix?.status === "done" && fix.prError ? (
                            <p className="text-xs font-medium text-rose-300" role="alert">
                              {fix.prError}
                            </p>
                          ) : null}
                          {fix?.status === "pr" ? (
                            <p className="text-xs font-medium text-emerald-300">
                              Pull request #{fix.number} is open.
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                      {fix?.status === "error" ? (
                        <p className="text-xs font-medium text-rose-300" role="alert">
                          {fix.message}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-col gap-2 lg:pt-0.5">
                      <button
                        type="button"
                        onClick={() => void refactorFile(key, violation.filePath)}
                        disabled={busy || settled}
                        aria-label={
                          settled
                            ? `Diff ready for ${violation.filePath}`
                            : fix?.status === "refactoring"
                              ? `Refactoring ${violation.filePath}`
                              : `Auto-Fix ${violation.filePath}`
                        }
                        className="min-w-[6.75rem] rounded-md bg-neutral-800 px-3 py-1.5 text-xs font-semibold text-zinc-100 ring-1 ring-neutral-700 transition-colors hover:bg-violet-600 hover:ring-violet-500 disabled:cursor-default disabled:opacity-70"
                      >
                        {actionLabel(fix)}
                      </button>
                      {fix?.status === "done" && fix.canPullRequest ? (
                        <button
                          type="button"
                          onClick={() => void openPullRequest(key, violation.filePath)}
                          className="min-w-[6.75rem] rounded-md bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-violet-500"
                        >
                          Open pull request
                        </button>
                      ) : null}
                      {fix?.status === "opening" ? (
                        <button
                          type="button"
                          disabled
                          className="min-w-[6.75rem] rounded-md bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white opacity-70"
                        >
                          Opening pull request...
                        </button>
                      ) : null}
                      {fix?.status === "pr" ? (
                        <a
                          href={fix.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex min-w-[6.75rem] items-center justify-center rounded-md bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-200 ring-1 ring-emerald-400/30"
                        >
                          View PR #{fix.number}
                        </a>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold tracking-tight text-white">Top 5 largest monoliths</h2>
            <p className="mt-0.5 text-xs text-zinc-500">Files with the most lines in this snapshot.</p>
          </div>
        </div>
        {report.largestFiles.length === 0 ? (
          <p className="rounded-lg border border-neutral-800 bg-neutral-900/50 px-4 py-6 text-sm text-zinc-500">
            No file sizes were recorded.
          </p>
        ) : (
          <ol className="space-y-1.5">
            {report.largestFiles.map((file, index) => (
              <li
                key={file.filePath}
                className="flex items-center justify-between gap-4 rounded-lg border border-neutral-800 bg-[#12141A] px-3.5 py-2.5"
              >
                <span className="min-w-0 truncate font-mono text-[12px] text-zinc-100">
                  <span className="mr-2.5 tabular-nums text-zinc-500">{index + 1}</span>
                  {file.filePath}
                </span>
                <span className="shrink-0 text-xs font-semibold tabular-nums text-amber-200">
                  {file.lineCount.toLocaleString("en-US")} lines
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
