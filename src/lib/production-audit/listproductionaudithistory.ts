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
import { parseProductionAuditHistoryRow } from "./parseproductionaudithistoryrow";

export async function listProductionAuditHistory(
  supabase: SupabaseClient,
  userId: string,
  limit = 25
): Promise<ProductionAuditHistoryEntry[]> {
  const { data, error } = await supabase
    .from("production_audit_history")
    .select(
      "id, production_score, audited_repo_url, audited_at, ci_cd_score, test_density, error_handling, created_at"
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    if (!isSupabaseSchemaError(error)) {
      console.error("Failed to load production audit history:", error);
    }
    return [];
  }

  return (data ?? [])
    .map((row) => parseProductionAuditHistoryRow(row as Record<string, unknown>))
    .filter((entry): entry is ProductionAuditHistoryEntry => Boolean(entry));
}
