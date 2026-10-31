import Link from "next/link";
import { ArrowLeft, CheckCircle2, Clock, XCircle } from "lucide-react";
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
    <div className="min-h-screen bg-zinc-950 p-8 font-mono text-zinc-100">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/firewall"
              aria-label="Back to Architecture Firewall"
              className="inline-flex items-center gap-1.5 text-zinc-500 transition-colors hover:text-zinc-200"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              <span className="text-[11px] tracking-wider uppercase">Back</span>
            </Link>
            <h1 className="text-sm font-semibold tracking-wider text-zinc-200 uppercase">Patch History</h1>
          </div>
          <span className="text-xs text-zinc-500">{logs.length} interventions recorded</span>
        </div>

        <div className="divide-y divide-zinc-800 rounded-lg border border-zinc-800 bg-zinc-900/50">
          {logs.length === 0 ? (
            <div className="p-8 text-center text-xs text-zinc-500">
              No autonomous interventions recorded yet. Engine is watching.
            </div>
          ) : (
            logs.map((log) => {
              const isLeak = log.branch_name?.includes("secrets") || log.category === "leaks";
              const isSuccess = log.status === "merged" || log.status === "open";
              const recordedAt = new Date(log.created_at);
              const clock = Number.isNaN(recordedAt.getTime())
                ? log.created_at
                : recordedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
              return (
                <div
                  key={log.id}
                  className="flex items-center justify-between p-4 text-xs transition-colors hover:bg-zinc-800/40"
                >
                  <div className="flex min-w-0 items-center gap-4">
                    {isSuccess ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                    ) : (
                      <XCircle className="h-4 w-4 shrink-0 text-rose-500" />
                    )}
                    <div className="min-w-0">
                      <span className="font-medium text-zinc-200">{log.file_path}</span>
                      <div className="mt-0.5 text-[10px] text-zinc-500">
                        {isLeak ? "leaks" : "violations"} — {log.commit_message || "Autonomous fix applied"}
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-4">
                    <span className="flex items-center gap-1 text-zinc-500">
                      <Clock className="h-3 w-3" />
                      {clock}
                    </span>
                    <span
                      className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${
                        isSuccess
                          ? "border border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                          : "border border-rose-500/20 bg-rose-500/10 text-rose-400"
                      }`}
                    >
                      {isSuccess ? "Patch Applied" : "patch reverted"}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
