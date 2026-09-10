import ScoreMeter from "@/components/ScoreMeter";
import {
  formatAuditedAt,
  formatAuditedRepoLabel,
  getProductionScoreBadge,
  type ProductionAuditRecord,
} from "@/lib/production-audit";

function SignalRow({
  label,
  score,
  detail,
}: {
  label: string;
  score: number;
  detail: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-semibold text-textMuted">{label}</span>
        <span className="text-[10px] font-medium text-textMuted">{detail}</span>
      </div>
      <ScoreMeter score={score} className="text-textMain" />
    </div>
  );
}

function signalDetail(score: number, presentLabel: string, missingLabel: string) {
  if (score >= 80) {
    return presentLabel;
  }
  if (score >= 40) {
    return "Partial";
  }
  return missingLabel;
}

export default function ProductionCodeAuditSection({
  record,
}: {
  record: ProductionAuditRecord | null;
}) {
  if (!record?.isAuditVerified) {
    return null;
  }

  const badge = getProductionScoreBadge(record.productionScore);
  const repo = formatAuditedRepoLabel(record.breakdown.audited_repo_url);
  const auditedAt = formatAuditedAt(record.breakdown.audited_at);

  return (
    <div>
      <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-textMuted">
        Production Code Audit
      </div>
      <div className="space-y-4 rounded-xl border border-border bg-background p-3.5">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="font-mono text-2xl font-extrabold tabular-nums text-textMain">
              {record.productionScore}
              <span className="ml-1 text-xs font-semibold text-textMuted">/100</span>
            </p>
            <p className="mt-1 text-[11px] text-textMuted">{repo}</p>
            {auditedAt ? (
              <p className="text-[10px] text-textMuted">Audited {auditedAt}</p>
            ) : null}
          </div>
          <span
            className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold ${badge.className}`}
          >
            {badge.label}
          </span>
        </div>
        <SignalRow
          label="CI pipeline depth"
          score={record.breakdown.ci_cd_score}
          detail={signalDetail(
            record.breakdown.ci_cd_score,
            "Configured",
            "None detected"
          )}
        />
        <SignalRow
          label="Assertion density"
          score={record.breakdown.test_density}
          detail={signalDetail(
            record.breakdown.test_density,
            "Full coverage",
            "No tests"
          )}
        />
        <SignalRow
          label="Error boundary status"
          score={record.breakdown.error_handling}
          detail={signalDetail(
            record.breakdown.error_handling,
            "Standardized",
            "Missing"
          )}
        />
      </div>
    </div>
  );
}
