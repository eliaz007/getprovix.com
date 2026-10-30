import type { AuditCheck } from "@/lib/audit-checks";
import { selectPrimaryCiWorkflowPath } from "@/lib/audit-content-signals";
import {
  formatCodebaseBenchmark,
  type CodebaseBenchmark,
} from "@/lib/codebase-benchmark";
import type { ProductionAuditMetrics } from "@/lib/production-audit-metrics";
import {
  resolveUnitTestFileCount,
  type RepoFilesystemEvidence,
} from "@/lib/repo-filesystem";
import { clampScore0to100 } from "@/lib/score-scale";
import {
  buildGitProvenance,
  buildHiringBattlePlanProbes,
  buildPillarSubLogs,
  buildSubsystemBlastRadius,
  type BlastRadiusRow,
  type GitProvenance,
  type PillarSubLog,
} from "@/lib/forensic-dossier";
import {
  synthesizeAuditInsights,
  type AuditScanData,
} from "@/lib/synthesize-audit-insights";

export function shortSha(sha: string | null): string {
  if (!sha) {
    return "Not pinned";
  }
  return sha.slice(0, 12);
}
