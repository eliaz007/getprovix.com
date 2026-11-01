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
import type { ProductionAuditRecord } from "./productionauditrecord";
import { isVerifiedDossier } from "./isverifieddossier";
import { canPublishProductionScore } from "./canpublishproductionscore";

export function employerVisibleProductionAudit(
  record: ProductionAuditRecord | null | undefined
): ProductionAuditRecord | null {
  if (!isVerifiedDossier(record) || !record?.isPubliclyVisible) {
    return null;
  }
  const hygiene = record.breakdown.delivery_hygiene_score;
  const historyAvailable =
    record.breakdown.commit_history_fetched === false
      ? false
      : hygiene == null
        ? false
        : true;
  if (
    !canPublishProductionScore(record.productionScore, hygiene, historyAvailable)
  ) {
    return null;
  }
  return record;
}
