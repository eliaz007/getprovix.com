"use client";

import { useEffect, useState } from "react";
import {
  StatusDot,
  mutedLabelClass,
  panelClass,
  rowHoverClass,
  sectionLabelClass,
} from "@/components/firewall/firewall-ui";
import type {
  FounderHealthVerdict,
  HealingAuditSummary,
  HealingSummaryResponse,
} from "@/lib/healing-audit-summary";

function verdictTone(verdict: FounderHealthVerdict): "ok" | "warn" | "danger" | "neutral" {
  if (verdict === "CLEAR") return "ok";
  if (verdict === "STABLE") return "neutral";
  if (verdict === "ATTENTION") return "warn";
  return "danger";
}

function verdictLabel(verdict: FounderHealthVerdict): string {
  return verdict.charAt(0) + verdict.slice(1).toLowerCase();
}

const EMPTY: HealingAuditSummary = {
  verdict: "CLEAR",
  headline: "No healing interventions on record.",
  detail: "The audit log is empty. Run a scan or connect the GitHub App to start monitoring.",
  criticalCount: 0,
  warningCount: 0,
  healedCount: 0,
  total: 0,
  critical: [],
  warnings: [],
};

export default function HealingAuditSummaryPanel() {
  const [summary, setSummary] = useState<HealingAuditSummary | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch("/api/firewall/healing-summary", { cache: "no-store" });
        const payload = (await response.json()) as HealingSummaryResponse;
        if (!active) return;
        setSummary(payload.ok && payload.summary ? payload.summary : EMPTY);
      } catch {
        if (active) setSummary(EMPTY);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const view = summary ?? EMPTY;
  const preview = [...view.critical, ...view.warnings].slice(0, 4);

  return (
    <section className={panelClass}>
      <div className="grid gap-6 px-5 py-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:items-start lg:gap-10">
        <div className="min-w-0 space-y-2">
          <div className="flex items-center gap-2">
            <StatusDot tone={verdictTone(view.verdict)} />
            <p className={mutedLabelClass}>Health</p>
            <span className="text-xs text-zinc-400">{verdictLabel(view.verdict)}</span>
          </div>
          <h2 className={sectionLabelClass}>{view.headline}</h2>
          <p className="max-w-2xl text-sm leading-relaxed text-zinc-500">{view.detail}</p>
        </div>

        <dl className="grid grid-cols-3 gap-4 border-t border-white/[0.06] pt-4 lg:border-t-0 lg:border-l lg:pl-8 lg:pt-0">
          <div>
            <dt className={mutedLabelClass}>Critical</dt>
            <dd className="mt-1 text-2xl font-medium tabular-nums tracking-tight text-zinc-100">
              {view.criticalCount}
            </dd>
          </div>
          <div>
            <dt className={mutedLabelClass}>Warnings</dt>
            <dd className="mt-1 text-2xl font-medium tabular-nums tracking-tight text-zinc-100">
              {view.warningCount}
            </dd>
          </div>
          <div>
            <dt className={mutedLabelClass}>Healed</dt>
            <dd className="mt-1 text-2xl font-medium tabular-nums tracking-tight text-zinc-100">
              {view.healedCount}
            </dd>
          </div>
        </dl>
      </div>

      {preview.length > 0 ? (
        <div className="border-t border-white/[0.06]">
          <button
            type="button"
            className={`flex w-full items-center justify-between px-5 py-3 text-left text-xs text-zinc-500 transition-colors ${rowHoverClass} hover:text-zinc-300`}
            aria-expanded={open}
            onClick={() => setOpen((current) => !current)}
          >
            <span>Recent issues</span>
            <span>{open ? "Hide" : "Show"}</span>
          </button>
          <div
            className={`grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none ${
              open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
            }`}
          >
            <div className="overflow-hidden">
              <table className="w-full text-left">
                <thead className="sr-only">
                  <tr>
                    <th>Severity</th>
                    <th>File</th>
                    <th>Issue</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((issue) => (
                    <tr key={issue.id} className={`border-t border-white/[0.04] ${rowHoverClass}`}>
                      <td className="w-28 px-5 py-3 align-middle">
                        <span className="inline-flex items-center gap-2 text-xs text-zinc-400">
                          <StatusDot tone={issue.tier === "critical" ? "danger" : "warn"} />
                          {issue.tier === "critical" ? "Critical" : "Warning"}
                        </span>
                      </td>
                      <td className="max-w-[14rem] truncate px-2 py-3 font-mono text-xs text-zinc-300">
                        {issue.filePath}
                      </td>
                      <td className="px-5 py-3 text-sm text-zinc-500">{issue.label}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {view.total > preview.length ? (
                <p className="border-t border-white/[0.04] px-5 py-3 text-xs text-zinc-600">
                  +{view.total - preview.length} more in the healing audit log
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
