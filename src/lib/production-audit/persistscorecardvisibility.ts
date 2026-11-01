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
import { PUBLIC_SCORECARD_THRESHOLD } from "./public-scorecard-threshold";
import { OWNERSHIP_UNVERIFIED_MESSAGE } from "./ownership-unverified-message";
import type { ProductionAuditRecord } from "./productionauditrecord";
import { isVerifiedDossier } from "./isverifieddossier";
import { resolvePublicScorecardVisibility } from "./resolvepublicscorecardvisibility";
import { parseProductionAuditFromProfileRow } from "./parseproductionauditfromprofilerow";

export async function persistScorecardVisibility(
  supabase: SupabaseClient,
  userId: string,
  isPubliclyVisible: boolean
): Promise<{ error: string | null; record: ProductionAuditRecord | null }> {
  const { data: roleRow } = await supabase
    .from("profiles")
    .select(
      "id, role, production_score, audit_breakdown, is_audit_verified, is_publicly_visible, verification_status, github_verified"
    )
    .or(`id.eq.${userId},user_id.eq.${userId}`)
    .limit(1)
    .maybeSingle();

  if (isEmployerRole(typeof roleRow?.role === "string" ? roleRow.role : null)) {
    return { error: "Employer accounts cannot publish a talent scorecard.", record: null };
  }

  const current = parseProductionAuditFromProfileRow(roleRow);
  if (!current || !isVerifiedDossier(current)) {
    return {
      error: OWNERSHIP_UNVERIFIED_MESSAGE,
      record: current,
    };
  }

  const nextVisible = resolvePublicScorecardVisibility(
    current.productionScore,
    isPubliclyVisible
  );

  if (isPubliclyVisible && !nextVisible) {
    return {
      error: `Profiles in the employer pool require a ${PUBLIC_SCORECARD_THRESHOLD}+ score.`,
      record: current,
    };
  }

  let payload: Record<string, unknown> = {
    is_publicly_visible: nextVisible,
  };

  if (nextVisible) {
    payload.is_visible_in_pool = true;
    payload.visible_to_employers = true;
  } else {
    payload.is_visible_in_pool = false;
    payload.visible_to_employers = false;
  }

  const profileId = typeof roleRow?.id === "string" ? roleRow.id : userId;
  const ownerFilter = `id.eq.${profileId},user_id.eq.${userId}`;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const { data, error } = await supabase
      .from("profiles")
      .update(payload)
      .or(ownerFilter)
      .select("id, is_publicly_visible")
      .maybeSingle();

    if (!error && data) {
      return {
        error: null,
        record: {
          ...current,
          isPubliclyVisible: nextVisible,
        },
      };
    }

    if (!error && !data) {
      return {
        error: "Could not update scorecard visibility for this account.",
        record: current,
      };
    }

    if (!isSupabaseSchemaError(error)) {
      console.error("Failed to update scorecard visibility:", error);
      return {
        error: error?.message ?? "Could not update scorecard visibility.",
        record: current,
      };
    }

    const mentioned = findMentionedColumn(error, Object.keys(payload));
    if (mentioned === "is_publicly_visible") {
      return {
        error:
          "Apply the latest database migration to enable scorecard visibility.",
        record: current,
      };
    }
    if (mentioned && mentioned in payload) {
      const { [mentioned]: _dropped, ...rest } = payload;
      payload = rest;
      continue;
    }

    return {
      error: error?.message ?? "Could not update scorecard visibility.",
      record: current,
    };
  }

  return { error: "Could not update scorecard visibility.", record: current };
}
