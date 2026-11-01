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
import { canPublishProductionScore } from "./canpublishproductionscore";

/**
 * Public verified badge when shared Provix Verified gates pass
 * (Code Health ≥ 75, History ≥ 80, commit history fetched).
 */
export function getProductionScoreBadge(
  score: number,
  deliveryHygieneScore?: number | null,
  historyAvailable?: boolean | null
): {
  label: string;
  className: string;
} | null {
  if (
    !canPublishProductionScore(score, deliveryHygieneScore, historyAvailable)
  ) {
    return null;
  }

  return {
    label: "Provix Verified",
    className: "bg-emerald-500/10 text-emerald-400 border-emerald-500/25",
  };
}
