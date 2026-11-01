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
import { PRIVATE_AUDITED_REPO_LABEL } from "./private-audited-repo-label";
import type { ProductionAuditClaim } from "./productionauditclaim";

export async function insertProductionAuditHistory(
  supabase: SupabaseClient,
  userId: string,
  claim: ProductionAuditClaim
): Promise<void> {
  const breakdown = claim.audit_breakdown;
  const auditedAt = (() => {
    const parsed = Date.parse(breakdown.audited_at);
    return Number.isFinite(parsed)
      ? new Date(parsed).toISOString()
      : new Date().toISOString();
  })();

  const { error } = await supabase.from("production_audit_history").insert({
    user_id: userId,
    production_score: clampScore0to100(claim.production_score),
    audited_repo_url: breakdown.audited_repo_url?.trim() || PRIVATE_AUDITED_REPO_LABEL,
    audited_at: auditedAt,
    ci_cd_score: clampScore0to100(breakdown.ci_cd_score),
    test_density: clampScore0to100(breakdown.test_density),
    error_handling: clampScore0to100(breakdown.error_handling),
  });

  if (error) {
    // History is additive; do not fail the profile save if the migration is pending.
    console.error("Failed to insert production audit history:", error);
  }
}
