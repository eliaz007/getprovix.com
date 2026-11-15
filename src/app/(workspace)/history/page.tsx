"use client";

import { useEffect, useState } from "react";
import {
  FilePathPill,
  StatusPill,
  elevatedSurfaceClass,
  formatAuditTimestamp,
  mutedLabelClass,
  panelClass,
} from "@/components/firewall/firewall-ui";
import type { HealingAuditRow } from "@/lib/firewall-open-prs";
import { readJsonResponse } from "@/lib/read-json-response";

type HistoryResponse = {
  ok?: boolean;
  entries?: HealingAuditRow[];
  message?: string;
};

export default function HistoryPage() {
  const [logs, setLogs] = useState<HealingAuditRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/firewall/activity", { cache: "no-store" });
        const payload = await readJsonResponse<HistoryResponse>(response);
        if (cancelled) return;
        if (!response.ok || !payload.ok || !Array.isArray(payload.entries)) {
          setError(payload.message ?? "Could not load activity.");
          setLogs([]);
          return;
        }
        setLogs(payload.entries);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not load activity.");
        setLogs([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-4 text-zinc-100">
      <header className="flex items-center justify-between gap-4 border-b border-zinc-800/60 pb-5">
        <div className="min-w-0">
          <p className="text-xs text-zinc-500">Workspace</p>
          <h1 className="text-xl font-medium tracking-tight text-zinc-50 sm:text-2xl">Activity</h1>
        </div>
        <span className={`${elevatedSurfaceClass} px-3 py-1.5 ${mutedLabelClass}`}>
          {logs === null ? (
            "Loading…"
          ) : (
            <>
              <span className="tabular-nums text-zinc-300">{logs.length}</span> interventions recorded
            </>
          )}
        </span>
      </header>

      <div className={panelClass}>
        {error ? (
          <div className="px-5 py-10 text-center text-sm text-red-300" role="alert">
            {error}
          </div>
        ) : logs === null ? (
          <div className="px-5 py-10 text-center text-sm text-zinc-500" role="status">
            Loading activity…
          </div>
        ) : logs.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-zinc-500">
            No interventions recorded yet.
          </div>
        ) : (
          <ul className="divide-y divide-zinc-800/60">
            {logs.map((log) => {
              const isLeak = log.branch_name?.includes("secrets") || log.category === "leaks";
              const isSuccess = log.status === "merged" || log.status === "open";
              const stamp = formatAuditTimestamp(log.created_at);
              return (
                <li
                  key={log.id}
                  className="group/row flex flex-col gap-3 px-4 py-3.5 transition-colors hover:bg-zinc-900/40 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusPill
                        label={isSuccess ? "Passed" : "Blocked"}
                        tone={isSuccess ? "ok" : "danger"}
                      />
                      <StatusPill label={isLeak ? "Security" : "Structure"} tone="neutral" />
                      <FilePathPill path={log.file_path} />
                    </div>
                    <p className="text-sm text-zinc-400">
                      {log.commit_message || "Autonomous fix applied"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3 sm:flex-col sm:items-end sm:gap-1.5">
                    <time
                      dateTime={log.created_at}
                      title={stamp.title}
                      className="text-xs tabular-nums text-zinc-500"
                    >
                      {stamp.label}
                    </time>
                    <span className="text-xs text-zinc-600">
                      {isSuccess ? "Patch applied" : "Reverted"}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
