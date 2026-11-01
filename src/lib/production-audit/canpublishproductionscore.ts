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

/**
 * Public scorecard / talent-pool publish gate — same floors as dossier Verified
 * and onboarding track qualification (Code Health ≥ 75, History ≥ 80, fetched).
 */
export function canPublishProductionScore(
  score: number,
  deliveryHygieneScore?: number | null,
  historyAvailable?: boolean | null
): boolean {
  return meetsProvixVerifiedGates({
    codeHealthScore: score,
    deliveryHygieneScore,
    historyAvailable,
  });
}
