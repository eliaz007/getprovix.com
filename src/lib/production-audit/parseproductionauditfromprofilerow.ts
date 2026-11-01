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
import { parseDossierVerificationStatus } from "./parsedossierverificationstatus";
import { resolvePublicScorecardVisibility } from "./resolvepublicscorecardvisibility";
import { parseProductionAuditBreakdown } from "./parseproductionauditbreakdown";

export function parseProductionAuditFromProfileRow(
  row:
    | {
        production_score?: number | string | null;
        audit_breakdown?: unknown;
        is_audit_verified?: boolean | null;
        is_publicly_visible?: boolean | null;
        verification_status?: string | null;
      }
    | null
    | undefined
): ProductionAuditRecord | null {
  if (!row) {
    return null;
  }

  const breakdown = parseProductionAuditBreakdown(row.audit_breakdown);
  const scoreRaw = row.production_score;
  const hasScore =
    typeof scoreRaw === "number" ||
    (typeof scoreRaw === "string" && scoreRaw.trim() !== "");

  if (!breakdown && !hasScore) {
    return null;
  }

  const productionScore = clampScore0to100(scoreRaw);
  const verificationStatus = parseDossierVerificationStatus(
    row.verification_status
  );
  const isAuditVerified = verificationStatus === "verified";
  const resolvedBreakdown = breakdown ?? {
    architecture_score: 0,
    ci_cd_score: 0,
    test_density: 0,
    error_handling: 0,
    audited_repo_url: "",
    audited_at: "",
  };
  const hygiene = resolvedBreakdown.delivery_hygiene_score;
  const historyAvailable =
    resolvedBreakdown.commit_history_fetched === false
      ? false
      : hygiene == null
        ? false
        : true;

  return {
    productionScore,
    breakdown: resolvedBreakdown,
    isAuditVerified,
    isPubliclyVisible:
      isAuditVerified &&
      resolvePublicScorecardVisibility(
        productionScore,
        row.is_publicly_visible === true,
        hygiene,
        historyAvailable
      ),
    verificationStatus,
  };
}
