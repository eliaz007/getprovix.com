"use client";

import { useEffect, useState } from "react";
import ExecutionStream from "@/components/firewall/execution-stream";
import IntegrityTab from "@/components/integrity-tab";
import { useFirewallView } from "@/components/firewall/firewall-view-context";
import type { FirewallReport, FirewallScanCoverage } from "@/lib/firewall-contract";
import type { HealingAuditEntry, HealingAuditResponse } from "@/lib/healing-audit";

const TABS = [
  { id: "stream" as const, label: "Live activity" },
  { id: "integrity" as const, label: "Repo score" },
];

export default function IntegrityPanel({
  repo,
  report,
}: {
  repo: string | null;
  report: FirewallReport | null;
  /** Kept for call-site compatibility; coverage lives in the Overview header. */
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
      <div
        className="flex gap-1 border-b border-zinc-800/60"
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
