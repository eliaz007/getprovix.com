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
import type { ProductionAuditClaim } from "./productionauditclaim";
import { resolvePublicScorecardVisibility } from "./resolvepublicscorecardvisibility";
import { buildProductionAuditBreakdown } from "./buildproductionauditbreakdown";

export function buildProductionAuditClaim(input: {
  score: number;
  githubUrl: string;
  filesystem?: RepoFilesystemEvidence | null;
  scoreCap?: ScoreCapAudit | null;
  isPubliclyVisible?: boolean;
  deliveryHygieneScore?: number | null;
  commitHistoryFetched?: boolean | null;
  auditedAt?: string;
}): ProductionAuditClaim {
  const production_score = clampScore0to100(input.score);
  const breakdown = buildProductionAuditBreakdown(input);
  return {
    production_score,
    audit_breakdown: breakdown,
    is_audit_verified: true,
    is_publicly_visible: resolvePublicScorecardVisibility(
      production_score,
      Boolean(input.isPubliclyVisible),
      input.deliveryHygieneScore,
      input.commitHistoryFetched
    ),
    delivery_hygiene_score: breakdown.delivery_hygiene_score,
    commit_history_fetched: breakdown.commit_history_fetched,
  };
}
