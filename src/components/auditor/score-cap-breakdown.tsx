import { AlertTriangle, Check, Minus } from "lucide-react";
import {
  resolveScoreCapAudit,
  type RepoFilesystemEvidence,
  type ScoreCapAudit,
} from "@/lib/repo-filesystem";

const ARTIFACT_CHIPS: Array<{
  key: keyof ScoreCapAudit["coreArtifacts"];
  label: string;
}> = [
  { key: "tests", label: "Tests" },
  { key: "ci", label: "CI/CD" },
  { key: "error_handling", label: "Error handling" },
];

type ScoreCapBreakdownProps = {
  scoreCap?: ScoreCapAudit | null;
  score?: number;
  filesystem?: RepoFilesystemEvidence | null;
  className?: string;
};

export default function ScoreCapBreakdown({
  scoreCap,
  score,
  filesystem = null,
  className = "",
}: ScoreCapBreakdownProps) {
  const audit = resolveScoreCapAudit(
    score ?? scoreCap?.cappedScore ?? 0,
    scoreCap,
    filesystem
  );

  if (!audit?.applied || audit.deductions.length === 0) {
    return null;
  }

  return (
    <div
      className={`rounded-xl border border-amber-500/25 bg-amber-500/5 p-4 space-y-3 ${className}`.trim()}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase font-bold text-amber-300 tracking-wider mb-1">
            Score cap audit trail
          </div>
          {audit.clipped ? (
            <p className="text-sm text-textMain font-semibold tabular-nums">
              {audit.uncappedScore}
              <span className="text-textMuted font-medium"> → </span>
              {audit.cappedScore}
              <span className="text-amber-200"> (−{audit.pointsDeducted})</span>
            </p>
          ) : (
            <p className="text-sm text-textMain font-semibold tabular-nums">
              Max allowed {audit.ceiling}/100
            </p>
          )}
          <p className="text-[11px] text-amber-100/80 leading-relaxed mt-1">
            {audit.clipped
              ? `Filesystem proof removed ${audit.pointsDeducted} point${audit.pointsDeducted === 1 ? "" : "s"} and capped the score at ${audit.ceiling}. README and write-ups cannot raise it.`
              : `The returned score is already at or below the ${audit.ceiling} filesystem ceiling. Point values below show how that ceiling is allocated across missing artifacts.`}
          </p>
        </div>
        <AlertTriangle
          className="w-4 h-4 text-amber-400 shrink-0 mt-0.5"
          aria-hidden
        />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {ARTIFACT_CHIPS.map((chip) => {
          const present = audit.coreArtifacts[chip.key];
          return (
            <span
              key={chip.key}
              className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-bold ${
 present
 ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
 : "border-red-500/25 bg-red-500/10 text-red-300"
 }`}
            >
              {present ? (
                <Check className="w-3 h-3" aria-hidden />
              ) : (
                <Minus className="w-3 h-3" aria-hidden />
              )}
              {chip.label}
            </span>
          );
        })}
      </div>

      <ul className="space-y-2">
        {audit.deductions.map((deduction) => (
          <li
            key={deduction.code}
            className="rounded-lg border border-border bg-background px-3 py-2.5"
          >
            <div className="flex items-start justify-between gap-3">
              <p className="text-xs font-semibold text-textMain leading-snug">
                {deduction.label}
              </p>
              <span className="shrink-0 text-xs font-mono font-bold tabular-nums text-amber-300">
                −{deduction.points}
              </span>
            </div>
            <p className="text-[11px] text-textMuted leading-relaxed mt-1">
              {deduction.detail}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
