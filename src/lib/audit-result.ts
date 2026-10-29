import type { AuditCheck } from "@/lib/audit-checks";
import type { AuditMode, EvaluationBreakdown } from "@/lib/audit-mode";
import type { CommitHistoryStat } from "@/lib/audit-readiness";
import type { CodebaseBenchmark } from "@/lib/codebase-benchmark";
import type { ExecutiveBrief } from "@/lib/executive-brief";
import type { ProductionAuditMetrics } from "@/lib/production-audit-metrics";
import type { RepoFilesystemEvidence, ScoreCapAudit } from "@/lib/repo-filesystem";

export type AuditResult = {
  score: number;
  /** Alias of score for the dual-mode evaluation schema. */
  overallScore: number;
  auditMode: AuditMode;
  tier: string;
  breakdown: EvaluationBreakdown;
  summary: string;
  strengths: string[];
  /** Alias of recommendations for the dual-mode evaluation schema. */
  improvements: string[];
  redFlags: string[];
  recommendations: string[];
  checks: AuditCheck[];
  scoreCap: ScoreCapAudit;
  /** File-tree-derived scorecard: architecture, tests, DevOps, resilience. */
  metrics: ProductionAuditMetrics;
  filesystem: RepoFilesystemEvidence | null;
  commitDates: string[];
  /** Optional per-commit churn samples used for dump / stub detection. */
  commitStats?: CommitHistoryStat[];
  /**
   * False when the GitHub commit list request failed. History cannot pass
   * Verified / publish / onboarding gates until a successful fetch.
   */
  commitHistoryFetched?: boolean;
  /** ISO timestamp when this audit run completed (dossier "Audited" label). */
  auditedAt?: string;
  inaccessibleRepo?: boolean;
  /** Rank of this production score among completed audits. Null when the count is unavailable. */
  benchmark?: CodebaseBenchmark | null;
  executiveBrief: ExecutiveBrief | null;
};
