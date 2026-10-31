import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import {
  FilePathPill,
  StatusPill,
  formatAuditTimestamp,
  mutedLabelClass,
  panelClass,
  rowHoverClass,
} from "@/components/firewall/firewall-ui";
import { listHealingAuditRows, type HealingAuditRow } from "@/lib/firewall-open-prs";
import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

function auditKey(row: HealingAuditRow): string {
  return `${row.file_path}|${row.branch_name ?? ""}|${row.status}`;
}

async function loadHealingLogs(): Promise<HealingAuditRow[]> {
  const recorded = await listHealingAuditRows();
  let audits: HealingAuditRow[] = [];
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("healing_audits")
      .select("*")
      .order("created_at", { ascending: false });
    if (!error && Array.isArray(data)) {
      audits = data.flatMap((row) => {
        const id = typeof row.id === "string" ? row.id : "";
        const filePath = typeof row.file_path === "string" ? row.file_path : "";
        const createdAt = typeof row.created_at === "string" ? row.created_at : "";
        if (!id || !filePath || !createdAt) return [];
        const category = row.category === "leaks" ? "leaks" : "violations";
        return [
          {
            id,
            file_path: filePath,
            branch_name: typeof row.branch_name === "string" ? row.branch_name : null,
            category,
            status: typeof row.status === "string" ? row.status : "open",
            commit_message: typeof row.commit_message === "string" ? row.commit_message : null,
            created_at: createdAt,
          },
        ];
      });
    }
  } catch (error) {
    console.error("[history] healing_audits read failed", error);
  }
  if (audits.length === 0) return recorded;
  const seen = new Set(audits.map(auditKey));
  return [...audits, ...recorded.filter((row) => !seen.has(auditKey(row)))].sort((a, b) =>
    b.created_at.localeCompare(a.created_at)
  );
}

export default async function HistoryPage() {
  const logs = await loadHealingLogs();

  return (
    <div className="min-h-screen bg-zinc-950 p-6 text-zinc-100 sm:p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-col gap-3 border-b border-white/[0.06] pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/firewall"
              aria-label="Back to Integrity"
              className="inline-flex items-center gap-1.5 text-xs text-zinc-500 transition-colors hover:text-zinc-200"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back
            </Link>
            <div>
              <p className="text-xs text-zinc-500">Audit log</p>
              <h1 className="text-xl font-medium tracking-tight text-zinc-50">Patch history</h1>
            </div>
          </div>
          <span className={mutedLabelClass}>
            <span className="tabular-nums text-zinc-300">{logs.length}</span> interventions recorded
          </span>
        </div>

        <div className={panelClass}>
          {logs.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-zinc-500">
              No autonomous interventions recorded yet. Engine is watching.
            </div>
          ) : (
            <ul>
              {logs.map((log) => {
                const isLeak = log.branch_name?.includes("secrets") || log.category === "leaks";
                const isSuccess = log.status === "merged" || log.status === "open";
                const stamp = formatAuditTimestamp(log.created_at);
                return (
                  <li
                    key={log.id}
                    className={`flex flex-col gap-3 border-t border-white/[0.04] px-5 py-4 first:border-t-0 sm:flex-row sm:items-center sm:justify-between ${rowHoverClass}`}
                  >
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusPill
                          label={isSuccess ? "Passed" : "Blocked"}
                          tone={isSuccess ? "ok" : "danger"}
                        />
                        <StatusPill label={isLeak ? "Leaks" : "Violations"} tone="neutral" />
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
    </div>
  );
}
