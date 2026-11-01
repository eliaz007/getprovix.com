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
import type { ProductionAuditBreakdown } from "./productionauditbreakdown";

export function buildProductionAuditBreakdown(input: {
  githubUrl: string;
  filesystem?: RepoFilesystemEvidence | null;
  scoreCap?: ScoreCapAudit | null;
  auditedAt?: string;
  deliveryHygieneScore?: number | null;
  commitHistoryFetched?: boolean | null;
}): ProductionAuditBreakdown {
  const metrics = computeProductionAuditMetrics(input.filesystem);

  const hygiene =
    typeof input.deliveryHygieneScore === "number" &&
    Number.isFinite(input.deliveryHygieneScore)
      ? clampScore0to100(input.deliveryHygieneScore)
      : undefined;
  const historyFetched =
    typeof input.commitHistoryFetched === "boolean"
      ? input.commitHistoryFetched
      : undefined;

  if (metrics.evidence.inspected) {
    return {
      architecture_score: metrics.architecture,
      ci_cd_score: metrics.devops,
      test_density: metrics.testing,
      error_handling: metrics.resilience,
      audited_repo_url: input.githubUrl.trim(),
      audited_at: input.auditedAt ?? new Date().toISOString(),
      delivery_hygiene_score: hygiene,
      commit_history_fetched: historyFetched,
    };
  }

  // No inspected tree: scoreCap is only a boolean presence signal.
  const testsPresent = Boolean(input.scoreCap?.coreArtifacts.tests);
  const ciPresent = Boolean(input.scoreCap?.coreArtifacts.ci);
  const errorPresent = Boolean(input.scoreCap?.coreArtifacts.error_handling);

  return {
    architecture_score: 0,
    ci_cd_score: ciPresent ? 55 : 0,
    test_density: testsPresent ? 40 : 0,
    error_handling: errorPresent ? 55 : 0,
    audited_repo_url: input.githubUrl.trim(),
    audited_at: input.auditedAt ?? new Date().toISOString(),
    delivery_hygiene_score: hygiene,
    commit_history_fetched: historyFetched,
  };
}
