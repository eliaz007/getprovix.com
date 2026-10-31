"use client";

import { useState } from "react";
import {
  StatusDot,
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
import { buildIntegrityMetrics, type IntegrityPosture, type ReviewFinding } from "@/lib/integrity-metrics";
import type { HealingAuditEntry } from "@/lib/healing-audit";

function postureTone(posture: IntegrityPosture | null): "ok" | "warn" | "danger" | "neutral" {
  if (posture === "OPTIMAL") return "ok";
  if (posture === "DEGRADED") return "warn";
  if (posture === "AT_RISK") return "danger";
  return "neutral";
}

function postureLabel(posture: IntegrityPosture | null): string {
  if (!posture) return "—";
  return posture
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

function fixStatusLabel(status: ReviewFinding["fixStatus"]): string {
  if (status === "AUTO_HEALED") return "Healed";
  if (status === "COMPILE_ABORTED") return "Blocked";
  return "Needs review";
}

function fixStatusTone(status: ReviewFinding["fixStatus"]): "ok" | "warn" | "danger" | "neutral" {
  if (status === "AUTO_HEALED") return "ok";
  if (status === "COMPILE_ABORTED") return "danger";
  return "warn";
}

function diffLineClass(line: string): string {
  if (line.startsWith("+") && !line.startsWith("+++")) return "text-emerald-400/90";
  if (line.startsWith("-") && !line.startsWith("---")) return "text-red-400/90";
  return "text-zinc-500";
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
            className="block w-full truncate text-left font-mono text-xs text-zinc-200 hover:text-white"
            aria-expanded={open}
            onClick={() => setOpen((current) => !current)}
          >
            {finding.filePath}
            <span className="text-zinc-600">:{finding.line}</span>
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

export default function IntegrityTab({
  repo,
  report,
  history,
}: {
  repo: string | null;
  report: FirewallReport | null;
  history: readonly HealingAuditEntry[];
}) {
  const metrics = buildIntegrityMetrics(report, history);
  const scoreLabel = metrics.score === null ? "—" : `${metrics.score}%`;
  const rateLabel = metrics.healRate === null ? "—" : `${metrics.healRate}%`;

  return (
    <section className={`${panelClass} space-y-0`}>
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-white/[0.06] px-5 py-5">
        <div className="min-w-0 space-y-1">
          <p className={mutedLabelClass}>Repository</p>
          <h2 className="truncate text-base font-medium tracking-tight text-zinc-100">
            {repo ?? "local"}
          </h2>
          <p className="flex items-center gap-2 text-xs text-zinc-500">
            <StatusDot tone="ok" />
            Live
            <span className="text-zinc-700">·</span>
            Branch protection not reported
          </p>
        </div>
        <div className="text-right">
          <p className="inline-flex items-center gap-2 text-sm text-zinc-300">
            <StatusDot tone={postureTone(metrics.posture)} />
            {postureLabel(metrics.posture)}
            {metrics.letter !== "—" ? (
              <span className="text-zinc-500">{metrics.letter}</span>
            ) : null}
          </p>
          <p className="mt-1 text-xs text-zinc-500">{metrics.statusText}</p>
        </div>
      </header>

      <dl className="grid grid-cols-2 border-b border-white/[0.06] lg:grid-cols-4">
        {[
          { label: "Integrity score", value: scoreLabel, hint: metrics.statusText },
          { label: "Auto-heal rate", value: rateLabel, hint: `${metrics.healed} healed` },
          { label: "Open exposures", value: String(metrics.openExposures), hint: "Across this scan" },
          { label: "Mean heal latency", value: metrics.latencyLabel, hint: "No timing recorded" },
        ].map((metric, index) => {
          const borders = [
            "border-b border-r border-white/[0.06] lg:border-b-0",
            "border-b border-white/[0.06] lg:border-b-0 lg:border-r",
            "border-r border-white/[0.06]",
            "",
          ][index];
          return (
            <div key={metric.label} className={`px-5 py-5 ${borders}`}>
              <dt className={mutedLabelClass}>{metric.label}</dt>
              <dd className="mt-2 text-2xl font-medium tabular-nums tracking-tight text-zinc-50">
                {metric.value}
              </dd>
              <p className="mt-1 truncate text-xs text-zinc-600">{metric.hint}</p>
            </div>
          );
        })}
      </dl>

      <div className="border-b border-white/[0.06]">
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h3 className={sectionLabelClass}>Security boundaries</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className={tableHeadClass}>
                <th className="px-5 py-2.5 font-medium">Severity</th>
                <th className="px-4 py-2.5 font-medium">Boundary</th>
                <th className="px-4 py-2.5 font-medium">Intercepted</th>
                <th className="px-4 py-2.5 font-medium">Healed</th>
                <th className="px-4 py-2.5 font-medium">Flagged</th>
                <th className="px-5 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {metrics.boundaries.map((row) => (
                <tr key={row.id} className={`border-t border-white/[0.04] ${rowHoverClass}`}>
                  <td className={`${tableCellClass} px-5`}>
                    <span className="inline-flex items-center gap-2 text-xs text-zinc-400">
                      <StatusDot tone={severityTone(row.severity)} />
                      {severityLabel(row.severity)}
                    </span>
                  </td>
                  <td className={`${tableCellClass} text-zinc-200`}>{formatBoundaryId(row.id)}</td>
                  <td className={`${tableCellClass} tabular-nums`}>{row.intercepted}</td>
                  <td className={`${tableCellClass} tabular-nums`}>{row.healed}</td>
                  <td className={`${tableCellClass} tabular-nums`}>{row.flagged}</td>
                  <td className={`${tableCellClass} px-5`}>
                    <span className="inline-flex items-center gap-2 text-xs text-zinc-400">
                      <StatusDot tone={row.status === "SECURE" ? "ok" : "warn"} />
                      {row.status === "SECURE" ? "Secure" : "Action needed"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="px-5 py-3 text-xs leading-relaxed text-zinc-600">
          Healed counts roll into the auto-heal rate. Stored commits do not record which boundary they closed.
        </p>
      </div>

      <div>
        <div className="px-5 pt-5 pb-3">
          <h3 className={sectionLabelClass}>Review queue</h3>
          <p className="mt-1 text-xs text-zinc-500">Findings waiting for a verified heal</p>
        </div>
        {metrics.queue.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-zinc-500">No findings are waiting for review.</p>
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
  );
}
