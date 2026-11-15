"use client";

import { useState } from "react";
import {
  FilePathPill,
  StatusDot,
  elevatedSurfaceClass,
  formatBoundaryId,
  mutedLabelClass,
  panelClass,
  rowHoverClass,
  sectionLabelClass,
  severityLabel,
  severityTone,
  tableCellClass,
  tableHeadClass,
} from "@/components/firewall/firewall-ui";
import type { FirewallReport } from "@/lib/firewall-contract";
import {
  buildIntegrityMetrics,
  type IntegrityMetrics,
  type ReviewFinding,
} from "@/lib/integrity-metrics";
import type { HealingAuditEntry } from "@/lib/healing-audit";

function fixStatusLabel(status: ReviewFinding["fixStatus"]): string {
  return status === "FIX_READY" ? "Can fix" : "Open";
}

function fixStatusTone(status: ReviewFinding["fixStatus"]): "ok" | "warn" | "danger" | "neutral" {
  // Never paint Open/Can-fix with a green Clear-like ok dot.
  return status === "FIX_READY" ? "neutral" : "warn";
}

function scanStamp(timestamp: string | undefined): string {
  if (!timestamp) return "No scan yet";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "Latest scan";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function diffLineClass(line: string): string {
  if (line.startsWith("+") && !line.startsWith("+++")) return "text-emerald-400/90";
  if (line.startsWith("-") && !line.startsWith("---")) return "text-red-400/90";
  return "text-zinc-500";
}

function tierPillClass(accent: IntegrityMetrics["tierAccent"]): string {
  switch (accent) {
    case "emerald":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
    case "purple":
      return "border-[#9333ea]/40 bg-[#9333ea]/15 text-[#c4b5fd]";
    case "amber":
      return "border-amber-500/30 bg-amber-500/10 text-amber-200";
    case "red":
      return "border-rose-500/30 bg-rose-500/10 text-rose-300";
    default:
      return "border-zinc-700/50 bg-zinc-900/40 text-zinc-400";
  }
}

function dimensionBarClass(accent: IntegrityMetrics["tierAccent"]): string {
  switch (accent) {
    case "emerald":
      return "bg-emerald-400";
    case "purple":
      return "bg-[#9333ea]";
    case "amber":
      return "bg-amber-400";
    case "red":
      return "bg-rose-400";
    default:
      return "bg-zinc-500";
  }
}

function ReviewRow({ finding }: { finding: ReviewFinding }) {
  const [open, setOpen] = useState(false);
  const lines = (finding.diff ?? "No patch was recorded for this finding.").split("\n");

  return (
    <>
      <tr className={`border-t border-white/[0.04] ${rowHoverClass}`}>
        <td className={`${tableCellClass} w-28`}>
          <span className="inline-flex items-center gap-2 text-xs text-zinc-400">
            <StatusDot tone={severityTone(finding.severity)} />
            {severityLabel(finding.severity)}
          </span>
        </td>
        <td className={`${tableCellClass} max-w-[12rem] truncate text-zinc-500`}>
          {formatBoundaryId(finding.category)}
        </td>
        <td className={`${tableCellClass} max-w-[18rem]`}>
          <button
            type="button"
            className="block w-full min-w-0 text-left hover:opacity-90"
            aria-expanded={open}
            onClick={() => setOpen((current) => !current)}
          >
            <FilePathPill path={finding.filePath} line={finding.line} />
          </button>
        </td>
        <td className={tableCellClass}>
          <span className="inline-flex items-center gap-2 text-xs text-zinc-400">
            <StatusDot tone={fixStatusTone(finding.fixStatus)} />
            {fixStatusLabel(finding.fixStatus)}
          </span>
        </td>
      </tr>
      {open ? (
        <tr className="border-t border-white/[0.04] bg-white/[0.015]">
          <td colSpan={4} className="px-4 py-4">
            <p className="text-sm leading-relaxed text-zinc-300">{finding.summary}</p>
            <p className="mt-2 text-xs leading-relaxed text-zinc-500">{finding.note}</p>
            <pre className="mt-3 overflow-x-auto rounded-lg border border-white/[0.06] bg-black/40 px-3 py-2.5 font-mono text-[11px] leading-5">
              {lines.map((line, index) => (
                <div key={`${finding.id}:${index}`} className={diffLineClass(line)}>
                  {line || " "}
                </div>
              ))}
            </pre>
          </td>
        </tr>
      ) : null}
    </>
  );
}

function PostureScoreCard({ metrics, scannedAt }: { metrics: IntegrityMetrics; scannedAt: string }) {
  const scoreLabel = metrics.score === null ? "—" : String(metrics.score);
  const footerLine =
    metrics.capReason ?? metrics.projectionLine ?? (metrics.score === null ? null : metrics.statusText);

  return (
    <section className={`${elevatedSurfaceClass} overflow-hidden`}>
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-zinc-800/60 px-5 py-4">
        <div className="min-w-0 space-y-1">
          <p className={mutedLabelClass}>Security Posture Index</p>
          <p className="text-xs text-zinc-500">Scanned {scannedAt}</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <p
            className="font-mono text-5xl font-medium tabular-nums tracking-tight text-zinc-50"
            aria-label={
              metrics.score === null
                ? "No score yet"
                : `Security Posture Index ${metrics.score} out of 100`
            }
          >
            {scoreLabel}
          </p>
          <span
            className={`mb-1.5 inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-medium tracking-wide ${tierPillClass(
              metrics.tierAccent
            )}`}
          >
            {metrics.tierLabel}
          </span>
        </div>
      </header>

      <div className="space-y-3 border-b border-zinc-800/60 px-5 py-4">
        {metrics.dimensions.map((dimension) => (
          <div key={dimension.id} className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-xs text-zinc-400">
                {dimension.label}
                <span className="ml-1.5 tabular-nums text-zinc-600">
                  {Math.round(dimension.weight * 100)}%
                </span>
              </p>
              <p className="font-mono text-xs tabular-nums text-zinc-300">{dimension.score}</p>
            </div>
            <div
              className="h-1.5 overflow-hidden rounded-full bg-zinc-900/80"
              role="progressbar"
              aria-valuenow={dimension.score}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${dimension.label} score ${dimension.score}`}
            >
              <div
                className={`h-full rounded-full transition-[width] duration-500 ${dimensionBarClass(
                  metrics.tierAccent
                )}`}
                style={{ width: `${Math.max(0, Math.min(100, dimension.score))}%` }}
              />
            </div>
          </div>
        ))}
        {footerLine ? (
          <p className="pt-1 text-xs leading-relaxed text-zinc-500" role="status">
            {footerLine}
          </p>
        ) : null}
      </div>

      <dl className="grid grid-cols-3">
        {[
          { label: "Critical", value: String(metrics.critical), hint: "Highest security severity" },
          {
            label: "Open findings",
            value: String(metrics.totalOpenFindings),
            hint: `${metrics.openExposures} security · ${metrics.structureCount} structure`,
          },
          { label: "Fix PRs", value: String(metrics.fixPullRequests), hint: "Opened for this repo" },
        ].map((metric, index) => {
          const borders = [
            "border-r border-zinc-800/60",
            "border-r border-zinc-800/60",
            "",
          ][index];
          return (
            <div key={metric.label} className={`px-5 py-4 ${borders}`}>
              <dt className={mutedLabelClass}>{metric.label}</dt>
              <dd className="mt-2 text-2xl font-medium tabular-nums tracking-tight text-zinc-50">
                {metric.value}
              </dd>
              <p className="mt-1 truncate text-xs text-zinc-600">{metric.hint}</p>
            </div>
          );
        })}
      </dl>
    </section>
  );
}

export default function IntegrityTab({
  report,
  history,
}: {
  /** Reserved for parent wiring; repo identity lives in the Overview header. */
  repo?: string | null;
  report: FirewallReport | null;
  history: readonly HealingAuditEntry[];
}) {
  const metrics = buildIntegrityMetrics(report, history);

  return (
    <div className="space-y-4">
      <PostureScoreCard metrics={metrics} scannedAt={scanStamp(report?.timestamp)} />

      <section className={panelClass}>
      <div className="border-b border-zinc-800/60">
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h3 className={sectionLabelClass}>Security boundaries</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className={tableHeadClass}>
                <th className="px-5 py-2.5 font-medium">Severity</th>
                <th className="px-4 py-2.5 font-medium">Boundary</th>
                <th className="px-4 py-2.5 font-medium">Open</th>
                <th className="px-5 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {metrics.boundaries.map((row) => (
                <tr key={row.id} className={`border-t border-white/[0.04] ${rowHoverClass}`}>
                  <td className={`${tableCellClass} px-5`}>
                    <span className="inline-flex items-center gap-2 text-xs text-zinc-400">
                      <StatusDot tone={severityTone(row.severity)} />
                      {row.severityIsCatalogMax ? (
                        <span className="text-zinc-500">
                          Max · {severityLabel(row.severity)}
                        </span>
                      ) : (
                        severityLabel(row.severity)
                      )}
                    </span>
                  </td>
                  <td className={`${tableCellClass} text-zinc-200`}>{formatBoundaryId(row.id)}</td>
                  <td className={`${tableCellClass} tabular-nums`}>{row.open}</td>
                  <td className={`${tableCellClass} px-5`}>
                    {row.open === 0 ? (
                      <span className="inline-flex items-center gap-2 text-xs text-emerald-400/90">
                        <StatusDot tone="ok" />
                        Clear
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-2 text-xs text-amber-200/90">
                        <StatusDot tone={row.open >= 5 ? "danger" : "warn"} />
                        {row.open} Open
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="px-5 py-3 text-xs leading-relaxed text-zinc-600">
          Counts are this scan. Fix with PR covers database exposure, secrets, and the dependency floors Provix knows.
        </p>
      </div>

      <div>
        <div className="px-5 pt-5 pb-3">
          <h3 className={sectionLabelClass}>Review queue</h3>
          <p className="mt-1 text-xs text-zinc-500">Findings Provix can open a Fix with PR for</p>
        </div>
        {metrics.queue.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-zinc-500">
            {metrics.openExposures > 0
              ? "No Fix with PR items in the queue — open findings are on Security for manual review."
              : "No findings are waiting for review."}
          </p>
        ) : (
          <div className="overflow-x-auto pb-1">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className={tableHeadClass}>
                  <th className="px-5 py-2.5 font-medium">Severity</th>
                  <th className="px-4 py-2.5 font-medium">Category</th>
                  <th className="px-4 py-2.5 font-medium">Location</th>
                  <th className="px-5 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {metrics.queue.map((finding) => (
                  <ReviewRow key={finding.id} finding={finding} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </section>
    </div>
  );
}
