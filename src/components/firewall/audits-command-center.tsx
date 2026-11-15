"use client";

import { useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import AuditScanningPanel from "@/components/firewall/audit-scanning-panel";
import { useFirewallView } from "@/components/firewall/firewall-view-context";
import {
  FilePathPill,
  StatusPill,
  elevatedSurfaceClass,
  mutedLabelClass,
  sectionLabelClass,
  severityLabel,
  severityTone,
} from "@/components/firewall/firewall-ui";
import type {
  FirewallReport,
  FirewallScanCoverage,
  FirewallSeverity,
  FirewallViolation,
} from "@/lib/firewall-contract";
import { SCAN_COVERAGE_COPY, partialScanLine } from "@/lib/firewall-repo-access";
import {
  buildOverviewOpenSummary,
  listOpenSecuritySnapshotFindings,
  listOpenStructureSnapshotFindings,
} from "@/lib/integrity-metrics";
import { normalizeScanSummaryNote } from "@/lib/firewall-scan-handoff";

type AuditsCommandCenterProps = {
  repoUrl: string;
  onRepoUrlChange: (value: string) => void;
  recentRepos: string[];
  scannedRepoUrl: string | null;
  isScanning: boolean;
  errorMessage: string | null;
  entryNote: string | null;
  coverage: FirewallScanCoverage | null | undefined;
  report: FirewallReport | null;
  onRunAudit: () => void;
  onSelectRepo: (repo: string) => void;
};

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

function sortBySeverity(left: FirewallViolation, right: FirewallViolation): number {
  const bySeverity = severityWeight(left.severity) - severityWeight(right.severity);
  if (bySeverity !== 0) return bySeverity;
  const byPath = left.filePath.localeCompare(right.filePath);
  if (byPath !== 0) return byPath;
  return left.line - right.line;
}

function formatScanTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function PreviewFindingRow({ finding }: { finding: FirewallViolation }) {
  const tone = severityTone(finding.severity);
  return (
    <li className="flex items-start justify-between gap-3 border-b border-zinc-800/50 px-4 py-3 last:border-b-0">
      <div className="min-w-0 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill
            label={severityLabel(finding.severity)}
            tone={tone === "ok" ? "ok" : tone === "danger" ? "danger" : tone === "warn" ? "warn" : "neutral"}
          />
          <FilePathPill path={finding.filePath} line={finding.line} />
        </div>
        <p className="line-clamp-2 text-[13px] leading-snug text-zinc-400">{finding.message}</p>
      </div>
    </li>
  );
}

function SummaryPreviewCard({
  title,
  count,
  findings,
  emptyLabel,
  ctaLabel,
  onViewAll,
}: {
  title: string;
  count: number;
  findings: FirewallViolation[];
  emptyLabel: string;
  ctaLabel: string;
  onViewAll: () => void;
}) {
  return (
    <section className={`${elevatedSurfaceClass} overflow-hidden`}>
      <div className="border-b border-zinc-800/60 px-5 py-4">
        <h3 className={sectionLabelClass}>{title}</h3>
        <p className={`mt-1 ${mutedLabelClass}`}>
          <span className="tabular-nums text-zinc-300">{count}</span> total
        </p>
      </div>
      {findings.length === 0 ? (
        <p className="px-5 py-8 text-sm text-zinc-500">{emptyLabel}</p>
      ) : (
        <ul>{findings.map((finding) => (
          <PreviewFindingRow
            key={`${finding.filePath}:${finding.line}:${finding.message}`}
            finding={finding}
          />
        ))}</ul>
      )}
      <div className="border-t border-zinc-800/60 px-5 py-3">
        <button
          type="button"
          onClick={onViewAll}
          className="text-sm font-medium text-violet-300 transition-colors hover:text-violet-200"
        >
          {ctaLabel}
        </button>
      </div>
    </section>
  );
}

export default function AuditsCommandCenter({
  repoUrl,
  onRepoUrlChange,
  recentRepos,
  scannedRepoUrl,
  isScanning,
  errorMessage,
  entryNote,
  coverage,
  report,
  onRunAudit,
  onSelectRepo,
}: AuditsCommandCenterProps) {
  const { setActiveView } = useFirewallView();
  const trimmed = repoUrl.trim();
  const coverageLine = partialScanLine(coverage ?? null) ?? (report ? SCAN_COVERAGE_COPY : null);
  const showResults = Boolean(report) && !isScanning;
  const cleanNote = entryNote ? normalizeScanSummaryNote(entryNote, scannedRepoUrl) : null;

  const openSummary = useMemo(
    () => buildOverviewOpenSummary(report),
    [report]
  );

  const securityFindings = useMemo(() => {
    if (!report) return [];
    return listOpenSecuritySnapshotFindings(report).sort(sortBySeverity);
  }, [report]);

  const structureFindings = useMemo(() => {
    if (!report) return [];
    return listOpenStructureSnapshotFindings(report).sort(sortBySeverity);
  }, [report]);

  // Counts come from the shared selector (includes PVIM in Security openExposures).
  const securityCount = openSummary.openExposures;
  const structureCount = openSummary.structureCount;
  const securityPreview = securityFindings.slice(0, 3);
  const structurePreview = structureFindings.slice(0, 3);

  return (
    <div className="space-y-4">
      <header className="space-y-1 pb-1">
        <p className="text-xs text-zinc-500">Repo scanner</p>
        <h1 className="text-2xl font-medium tracking-tight text-zinc-50">Audits</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-zinc-500">
          Choose a connected repository or paste a GitHub link. Provix scans for secrets, data leaks,
          and database security issues.
        </p>
      </header>

      <AnimatePresence mode="wait">
        {isScanning ? (
          <AuditScanningPanel key="scanning" repo={scannedRepoUrl} />
        ) : (
          <motion.div
            key="command"
            className="space-y-4"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          >
            <form
              className={`${elevatedSurfaceClass} px-5 py-5 sm:px-6`}
              onSubmit={(event) => {
                event.preventDefault();
                onRunAudit();
              }}
            >
              <label htmlFor="audits-repo-url" className="text-xs text-zinc-500">
                Repository
              </label>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <input
                  id="audits-repo-url"
                  type="text"
                  inputMode="url"
                  value={repoUrl}
                  onChange={(event) => onRepoUrlChange(event.target.value)}
                  placeholder="owner/repo or https://github.com/owner/repo"
                  disabled={isScanning}
                  className="min-w-0 flex-1 rounded-lg border border-white/[0.08] bg-black/40 px-3 py-2.5 font-mono text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-white/20 disabled:opacity-60"
                />
                <button
                  type="submit"
                  disabled={!trimmed || isScanning}
                  className="shrink-0 rounded-lg bg-zinc-100 px-5 py-2.5 text-sm font-medium text-zinc-950 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Run Audit
                </button>
              </div>
              {recentRepos.length > 0 ? (
                <div className="mt-4">
                  <p className={`mb-2 ${mutedLabelClass}`}>Connected repositories</p>
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {recentRepos.map((repo) => {
                      const selected = scannedRepoUrl === repo;
                      return (
                        <li key={repo}>
                          <button
                            type="button"
                            disabled={isScanning}
                            onClick={() => onSelectRepo(repo)}
                            className={`flex w-full items-center justify-between gap-2 rounded-xl border px-3.5 py-2.5 text-left transition-colors disabled:opacity-60 ${
                              selected
                                ? "border-violet-500/35 bg-violet-500/10"
                                : "border-white/[0.06] bg-black/20 hover:border-white/[0.12] hover:bg-white/[0.03]"
                            }`}
                          >
                            <span className="truncate font-mono text-sm text-zinc-200">{repo}</span>
                            <span className="shrink-0 text-xs text-zinc-500">Scan</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}
            </form>

            {errorMessage ? (
              <p
                className="rounded-xl border border-red-500/25 bg-red-500/5 px-5 py-4 text-sm text-red-200"
                role="alert"
              >
                {errorMessage}
              </p>
            ) : null}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showResults && report ? (
          <motion.div
            key="results"
            className="space-y-4"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="flex flex-wrap items-end justify-between gap-3 px-0.5">
              <div>
                <p className={sectionLabelClass}>Latest scan</p>
                <p className={`mt-1 ${mutedLabelClass}`}>
                  {formatScanTimestamp(report.timestamp)}
                  {coverageLine ? ` · ${coverageLine}` : null}
                </p>
                {cleanNote ? <p className="mt-1 max-w-2xl text-xs text-zinc-600">{cleanNote}</p> : null}
              </div>
              <dl className="flex gap-6">
                <div>
                  <dt className={mutedLabelClass}>Security</dt>
                  <dd className="mt-0.5 text-2xl font-medium tabular-nums tracking-tight text-zinc-50">
                    {securityCount}
                  </dd>
                </div>
                <div>
                  <dt className={mutedLabelClass}>Structure</dt>
                  <dd className="mt-0.5 text-2xl font-medium tabular-nums tracking-tight text-zinc-50">
                    {structureCount}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <SummaryPreviewCard
                title="Security Findings"
                count={securityCount}
                findings={securityPreview}
                emptyLabel="No security findings in this scan."
                ctaLabel="View all in Security →"
                onViewAll={() => setActiveView("leaks")}
              />
              <SummaryPreviewCard
                title="Structure & Architecture"
                count={structureCount}
                findings={structurePreview}
                emptyLabel="No structure findings in this scan."
                ctaLabel="View all in Structure →"
                onViewAll={() => setActiveView("violations")}
              />
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
