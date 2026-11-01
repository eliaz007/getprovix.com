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
import { parseDossierVerificationStatus } from "./parsedossierverificationstatus";
import { isVerifiedDossier } from "./isverifieddossier";
import { canPublishProductionScore } from "./canpublishproductionscore";
import { parseProductionAuditFromProfileRow } from "./parseproductionauditfromprofilerow";
import { insertProductionAuditHistory } from "./insertproductionaudithistory";

export async function persistProfileProductionAudit(
  supabase: SupabaseClient,
  userId: string,
  claim: ProductionAuditClaim,
  options?: {
    isPubliclyVisible?: boolean;
    enrollInTalentPool?: boolean;
    verificationStatus?: DossierVerificationStatus;
    attachToProfile?: boolean;
  }
): Promise<{ error: string | null; profileSlug?: string | null; skipped?: boolean }> {
  const { data: roleRow } = await supabase
    .from("profiles")
    .select(
      "id, role, profile_slug, verification_status, is_audit_verified, production_score, audit_breakdown, is_publicly_visible, github_verified, full_name, name, first_name, last_name, job_title, headline, bio, skills, work_preference, timezone, availability_status, availability"
    )
    .or(`id.eq.${userId},user_id.eq.${userId}`)
    .limit(1)
    .maybeSingle();

  if (isEmployerRole(typeof roleRow?.role === "string" ? roleRow.role : null)) {
    return { error: null };
  }

  const existing = parseProductionAuditFromProfileRow(roleRow);
  const verificationStatus = parseDossierVerificationStatus(
    options?.verificationStatus
  );
  const isVerified = verificationStatus === "verified";
  const attachToProfile = options?.attachToProfile !== false;

  if (!isVerified && isVerifiedDossier(existing)) {
    return {
      error: null,
      skipped: true,
      profileSlug:
        typeof roleRow?.profile_slug === "string"
          ? roleRow.profile_slug.trim() || null
          : null,
    };
  }

  const productionScore = clampScore0to100(claim.production_score);
  let payload: Record<string, unknown> = {
    is_audit_verified: isVerified,
    verification_status: verificationStatus,
  };

  if (attachToProfile) {
    payload.production_score = productionScore;
    payload.audit_score = productionScore;
    payload.audit_breakdown = claim.audit_breakdown;
  }

  const enrollInTalentPool = isVerified && options?.enrollInTalentPool === true;
  const publishRequested =
    isVerified && (options?.isPubliclyVisible === true || enrollInTalentPool);
  const hideRequested =
    !isVerified ||
    (options?.isPubliclyVisible === false && !enrollInTalentPool);
  const canPublish =
    isVerified &&
    canPublishProductionScore(
      productionScore,
      claim.delivery_hygiene_score ?? claim.audit_breakdown.delivery_hygiene_score,
      claim.commit_history_fetched ??
        claim.audit_breakdown.commit_history_fetched
    );

  const autoPublishRow: PublishedCandidateProfileRow = {
    ...(roleRow as PublishedCandidateProfileRow),
    github_verified: roleRow?.github_verified === true,
    production_score: attachToProfile
      ? productionScore
      : typeof roleRow?.production_score === "number"
        ? roleRow.production_score
        : null,
    audit_score: attachToProfile ? productionScore : null,
    role: typeof roleRow?.role === "string" ? roleRow.role : null,
  };
  const shouldAutoPublish = meetsTalentPoolAutoPublishCriteria(autoPublishRow);

  if (enrollInTalentPool && canPublish) {
    payload.is_in_talent_pool = true;
    payload.is_publicly_visible = true;
    // 75+ is the gate for talent-network visibility.
    payload.is_visible_in_pool = true;
    payload.visible_to_employers = true;
  } else if ((publishRequested && canPublish) || shouldAutoPublish) {
    payload.is_publicly_visible = true;
    payload.is_visible_in_pool = true;
    payload.visible_to_employers = true;
    if (shouldAutoPublish) {
      const metadata = talentPoolMetadataDefaults(roleRow ?? undefined);
      payload.work_preference = metadata.work_preference;
      payload.timezone = metadata.timezone;
      payload.availability_status = metadata.availability_status;
    }
  } else if (hideRequested || !canPublish) {
    payload.is_publicly_visible = false;
    if (!canPublish && !shouldAutoPublish) {
      payload.is_visible_in_pool = false;
      payload.visible_to_employers = false;
    }
  }

  const profileId = typeof roleRow?.id === "string" ? roleRow.id : userId;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const { error } = await supabase
      .from("profiles")
      .update(payload)
      .eq("id", profileId);

    if (!error) {
      if (isVerified && attachToProfile) {
        await insertProductionAuditHistory(supabase, userId, claim);
      }
      return {
        error: null,
        profileSlug:
          typeof roleRow?.profile_slug === "string"
            ? roleRow.profile_slug.trim() || null
            : null,
      };
    }

    if (!isSupabaseSchemaError(error)) {
      console.error("Failed to persist production audit:", error);
      return { error: error.message ?? "Could not save production audit." };
    }

    const mentioned = findMentionedColumn(error, Object.keys(payload));
    if (mentioned && mentioned in payload) {
      const { [mentioned]: _dropped, ...rest } = payload;
      payload = rest;
      continue;
    }

    return { error: error.message ?? "Could not save production audit." };
  }

  return { error: "Could not save production audit." };
}
