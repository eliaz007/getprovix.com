import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchWithAuth } from "@/lib/fetch-with-auth";
import { readJsonResponse } from "@/lib/read-json-response";
import { isEmployerRole } from "@/lib/dashboard-account";
import { parseGitHubUrl } from "@/lib/validate-github-url";
import type {
  RepoFilesystemEvidence,
  ScoreCapAudit,
} from "@/lib/repo-filesystem";
import { deriveDualModeScores } from "@/lib/audit-mode";
import { meetsProvixVerifiedGates } from "@/lib/audit-readiness";
import { computeProductionAuditMetrics } from "@/lib/production-audit-metrics";
import { clampScore0to100 } from "@/lib/score-scale";
import {
  findMentionedColumn,
  isSupabaseSchemaError,
} from "@/lib/supabase-schema-errors";
import {
  meetsTalentPoolAutoPublishCriteria,
  talentPoolMetadataDefaults,
  type PublishedCandidateProfileRow,
} from "@/lib/published-candidate-profile";
import type { ProductionAuditHistoryEntry } from "./productionaudithistoryentry";

export function parseProductionAuditHistoryRow(
  row: Record<string, unknown> | null | undefined
): ProductionAuditHistoryEntry | null {
  if (!row || typeof row.id !== "string") {
    return null;
  }

  const auditedRepoUrl =
    typeof row.audited_repo_url === "string" ? row.audited_repo_url : "";
  const auditedAt =
    typeof row.audited_at === "string"
      ? row.audited_at
      : typeof row.created_at === "string"
        ? row.created_at
        : "";
  const createdAt =
    typeof row.created_at === "string" ? row.created_at : auditedAt;

  const productionScore = clampScore0to100(row.production_score);
  const ciCdScore = clampScore0to100(row.ci_cd_score);
  const testDensity = clampScore0to100(row.test_density);
  const errorHandling = clampScore0to100(row.error_handling);
  const architectureScore = clampScore0to100(
    row.architecture_score ?? row.architectureScore
  );
  const dual = deriveDualModeScores({
    productionScore,
    contractScore:
      typeof row.contract_score === "number"
        ? row.contract_score
        : typeof row.contractScore === "number"
          ? row.contractScore
          : null,
    fullTimeScore:
      typeof row.fulltime_score === "number"
        ? row.fulltime_score
        : typeof row.full_time_score === "number"
          ? row.full_time_score
          : typeof row.fullTimeScore === "number"
            ? row.fullTimeScore
            : null,
    architecture: architectureScore > 0 ? architectureScore : null,
    testing: testDensity,
    devops: ciCdScore,
    resilience: errorHandling,
  });
  const commitSha =
    typeof row.commit_sha === "string" && row.commit_sha.trim()
      ? row.commit_sha.trim()
      : typeof row.commitSha === "string" && row.commitSha.trim()
        ? row.commitSha.trim()
        : null;

  return {
    id: row.id,
    productionScore,
    contractScore: dual.contractScore,
    fullTimeScore: dual.fullTimeScore,
    auditedRepoUrl,
    auditedAt,
    ciCdScore,
    testDensity,
    errorHandling,
    architectureScore,
    commitSha,
    createdAt,
  };
}
