import type { AuditCheck, AuditCheckId } from "@/lib/audit-checks";

const CHECK_STYLES: Record<
  AuditCheckId,
  { title: string; body: string }
> = {
  artifact_analysis: {
    title: "text-indigo-300",
    body: "bg-indigo-500/5 border-indigo-500/10",
  },
  architecture_review: {
    title: "text-purple-300",
    body: "bg-purple-500/5 border-purple-500/10",
  },
  api_resiliency: {
    title: "text-cyan-300",
    body: "bg-cyan-500/5 border-cyan-500/10",
  },
};

export default function AuditChecksList({
  checks,
}: {
  checks?: AuditCheck[] | null;
}) {
  if (!checks?.length) {
    return null;
  }

  return (
    <div className="space-y-3">
      {checks.map((check) => {
        const style = CHECK_STYLES[check.id] ?? CHECK_STYLES.artifact_analysis;

        return (
          <div key={check.id}>
            <div
              className={`text-[10px] uppercase font-bold tracking-wider mb-2 ${style.title}`}
            >
              {check.title}
            </div>
            <p
              className={`text-xs text-slate-300 leading-relaxed border rounded-lg px-3 py-2 ${style.body}`}
            >
              {check.summary}
            </p>
          </div>
        );
      })}
    </div>
  );
}
