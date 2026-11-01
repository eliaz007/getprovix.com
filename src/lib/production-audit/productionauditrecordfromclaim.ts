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
import type { DossierVerificationStatus } from "./dossierverificationstatus";
import type { ProductionAuditClaim } from "./productionauditclaim";
import type { ProductionAuditRecord } from "./productionauditrecord";

export function productionAuditRecordFromClaim(
  claim: ProductionAuditClaim,
  verificationStatus: DossierVerificationStatus = "unverified"
): ProductionAuditRecord {
  const isAuditVerified = verificationStatus === "verified";
  return {
    productionScore: claim.production_score,
    breakdown: claim.audit_breakdown,
    isAuditVerified,
    isPubliclyVisible: isAuditVerified && claim.is_publicly_visible,
    verificationStatus,
  };
}
