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
import { PENDING_PRODUCTION_AUDIT_KEY } from "./pending-production-audit-key";
import type { ProductionAuditClaim } from "./productionauditclaim";

export function cachePendingProductionAudit(claim: ProductionAuditClaim): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      PENDING_PRODUCTION_AUDIT_KEY,
      JSON.stringify(claim)
    );
  } catch (error) {
    console.error("Could not cache production audit claim:", error);
  }
}
