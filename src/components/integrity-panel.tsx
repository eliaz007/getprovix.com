"use client";

import { useEffect, useState } from "react";
import ExecutionStream from "@/components/firewall/execution-stream";
import { mutedLabelClass, panelClass } from "@/components/firewall/firewall-ui";
import IntegrityTab from "@/components/integrity-tab";
import { useFirewallView } from "@/components/firewall/firewall-view-context";
import type { FirewallReport, FirewallScanCoverage } from "@/lib/firewall-contract";
import { partialScanLine } from "@/lib/firewall-repo-access";
import type { HealingAuditEntry, HealingAuditResponse } from "@/lib/healing-audit";

const TABS = [
  { id: "stream" as const, label: "Live activity" },
  { id: "integrity" as const, label: "Repo score" },
];

function ScanBrief({
  report,
  coverage,
}: {
  report: FirewallReport | null;
  coverage?: FirewallScanCoverage | null;
}) {
  if (!report) return null;
  const criticalCount = report.violations.filter((violation) => violation.severity === "CRITICAL").length;
  const highCount = report.violations.filter((violation) => violation.severity === "HIGH").length;
  const otherCount = report.violations.length - criticalCount - highCount;
  const coverageLine = partialScanLine(coverage);
  return (
    <section className={`${panelClass} px-5 py-5`}>
      <p className={mutedLabelClass}>This repository</p>
      <h2 className="mt-2 text-[15px] font-medium tracking-tight text-zinc-100">
        {criticalCount} critical · {highCount} high · {otherCount} other
      </h2>
      <p className="mt-1 max-w-3xl text-sm leading-relaxed text-zinc-500">
        The score is this scan only. Fix with PR can open a patch for database exposure, secrets, known dependency
        floors, and oversized modules.
      </p>
      {coverageLine ? <p className="mt-3 text-sm text-amber-200/90">{coverageLine}</p> : null}
    </section>
  );
}

export default function IntegrityPanel({
  repo,
  report,
  coverage,
}: {
  repo: string | null;
  report: FirewallReport | null;
  coverage?: FirewallScanCoverage | null;
}) {
  const { integrityPane, setIntegrityPane } = useFirewallView();
  const [history, setHistory] = useState<HealingAuditEntry[]>([]);

  useEffect(() => {
    if (!repo) {
      setHistory([]);
      return;
    }
    let active = true;
    void (async () => {
      try {
        const response = await fetch(`/api/firewall/history?repo=${encodeURIComponent(repo)}`, {
          cache: "no-store",
        });
        const payload = (await response.json()) as HealingAuditResponse;
        if (!active) return;
        setHistory(Array.isArray(payload.entries) ? payload.entries : []);
      } catch {
        if (active) setHistory([]);
      }
    })();
    return () => {
      active = false;
    };
  }, [repo]);

  return (
    <div className="space-y-4">
      <ScanBrief report={report} coverage={coverage} />

      <div
        className="flex gap-1 border-b border-white/[0.06]"
        role="tablist"
        aria-label="Overview views"
      >
        {TABS.map((tab) => {
          const selected = integrityPane === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={selected}
              className={`-mb-px border-b px-3 pb-2.5 text-sm transition-colors ${
                selected
                  ? "border-zinc-100 text-zinc-100"
                  : "border-transparent text-zinc-500 hover:text-zinc-300"
              }`}
              onClick={() => setIntegrityPane(tab.id)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {integrityPane === "stream" ? (
        <div role="tabpanel" className="min-w-0">
          <ExecutionStream repo={repo} report={report} history={history} />
        </div>
      ) : (
        <div role="tabpanel" className="min-w-0">
          <IntegrityTab repo={repo} report={report} history={history} />
        </div>
      )}
    </div>
  );
}
