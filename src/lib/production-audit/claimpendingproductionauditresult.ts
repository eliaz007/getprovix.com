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
import { OWNERSHIP_UNVERIFIED_MESSAGE } from "./ownership-unverified-message";
import type { ProductionAuditClaim } from "./productionauditclaim";
import { parseDossierVerificationStatus } from "./parsedossierverificationstatus";
import { canPublishProductionScore } from "./canpublishproductionscore";
import { readPendingProductionAudit } from "./readpendingproductionaudit";
import { clearPendingProductionAudit } from "./clearpendingproductionaudit";
import { productionAuditRecordFromClaim } from "./productionauditrecordfromclaim";
import type { ClaimPendingResult } from "./claimpendingresult";

export async function claimPendingProductionAuditResult(): Promise<ClaimPendingResult> {
  const pending = readPendingProductionAudit();
  if (!pending) {
    return {
      record: null,
      error: null,
      enrolledInTalentPool: false,
      profileSlug: null,
    };
  }

  const pendingHygiene =
    pending.delivery_hygiene_score ??
    pending.audit_breakdown.delivery_hygiene_score;
  const pendingHistoryFetched =
    pending.commit_history_fetched ??
    pending.audit_breakdown.commit_history_fetched;
  const nextClaim: ProductionAuditClaim = {
    ...pending,
    is_publicly_visible:
      pending.is_publicly_visible ||
      canPublishProductionScore(
        pending.production_score,
        pendingHygiene,
        pendingHistoryFetched
      ),
  };

  try {
    const response = await fetchWithAuth("/api/profile/production-audit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(nextClaim),
    });

    const payload = await readJsonResponse<{
      error?: string;
      enrolled_in_talent_pool?: boolean;
      profile_slug?: string | null;
      is_publicly_visible?: boolean;
    }>(response);

    if (!response.ok) {
      if (response.status === 403) {
        clearPendingProductionAudit();
        return {
          record: productionAuditRecordFromClaim(nextClaim, "unverified"),
          error:
            payload.error?.trim() || OWNERSHIP_UNVERIFIED_MESSAGE,
          enrolledInTalentPool: false,
          profileSlug: null,
        };
      }
      return {
        record: null,
        error:
          payload.error?.trim() ||
          "Could not claim this production audit.",
        enrolledInTalentPool: false,
        profileSlug: null,
      };
    }

    clearPendingProductionAudit();
    const enrolled = payload.enrolled_in_talent_pool === true;
    const verificationStatus = parseDossierVerificationStatus(
      (payload as { verification_status?: string }).verification_status ??
        "verified"
    );
    return {
      record: productionAuditRecordFromClaim(nextClaim, verificationStatus),
      error: null,
      enrolledInTalentPool: enrolled,
      profileSlug:
        typeof payload.profile_slug === "string"
          ? payload.profile_slug.trim() || null
          : null,
    };
  } catch (error) {
    console.error("Claim production audit failed:", error);
    return {
      record: null,
      error: "Could not claim this production audit.",
      enrolledInTalentPool: false,
      profileSlug: null,
    };
  }
}
