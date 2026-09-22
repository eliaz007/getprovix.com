import {
  normalizeAuditChecks,
  type AuditCheck,
  type AuditCheckId,
} from "@/lib/audit-checks";

const CHECK_STYLES: Record<
  AuditCheckId,
  { title: string; body: string }
> = {
  artifact_analysis: {
    title: "text-brand",
    body: "bg-brandGlow border-brand/20",
  },
  architecture_review: {
    title: "text-violet-300",
    body: "bg-violet-500/5 border-violet-500/10",
  },
  api_resiliency: {
    title: "text-violet-200",
    body: "bg-violet-500/5 border-violet-500/15",
  },
};

export default function AuditChecksList({
  checks,
}: {
  checks?: AuditCheck[] | null;
}) {
  const items = normalizeAuditChecks(checks);

  return (
    <div className="space-y-3">
      {items.map((check, index) => {
        const style = CHECK_STYLES[check.id] ?? CHECK_STYLES.artifact_analysis;

        return (
          <div key={`${check.id}-${index}`}>
            <div
              className={`text-[10px] uppercase font-bold tracking-wider mb-2 ${style.title}`}
            >
              {check.title}
            </div>
            <p
              className={`text-xs text-textMuted leading-relaxed border rounded-lg px-3 py-2 ${style.body}`}
            >
              {check.summary}
            </p>
          </div>
        );
      })}
    </div>
  );
}
