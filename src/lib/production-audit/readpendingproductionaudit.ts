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
import { resolvePublicScorecardVisibility } from "./resolvepublicscorecardvisibility";
import { parseProductionAuditBreakdown } from "./parseproductionauditbreakdown";

export function readPendingProductionAudit(): ProductionAuditClaim | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(PENDING_PRODUCTION_AUDIT_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as ProductionAuditClaim;
    if (
      typeof parsed?.production_score !== "number" ||
      !parsed.audit_breakdown ||
      parsed.is_audit_verified !== true
    ) {
      return null;
    }

    const breakdown = parseProductionAuditBreakdown(parsed.audit_breakdown);
    if (!breakdown) {
      return null;
    }

    const production_score = clampScore0to100(parsed.production_score);

    return {
      production_score,
      audit_breakdown: breakdown,
      is_audit_verified: true,
      is_publicly_visible: resolvePublicScorecardVisibility(
        production_score,
        parsed.is_publicly_visible === true
      ),
    };
  } catch {
    return null;
  }
}
