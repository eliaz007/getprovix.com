import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchWithAuth } from "@/lib/fetch-with-auth";
import { readJsonResponse } from "@/lib/read-json-response";
import { isEmployerRole } from "@/lib/dashboard-account";
import { parseGitHubUrl } from "@/lib/validate-github-url";
import type {
  RepoFilesystemEvidence,
  ScoreCapAudit,
} from "@/lib/repo-filesystem";
import { computeProductionAuditMetrics } from "@/lib/production-audit-metrics";
import { clampScore0to100 } from "@/lib/score-scale";
import {
  findMentionedColumn,
  isSupabaseSchemaError,
} from "@/lib/supabase-schema-errors";

export const PENDING_PRODUCTION_AUDIT_KEY = "provix_pending_production_audit";
export const CLAIM_AUDIT_INTENT = "claim_audit";
export const PRIVATE_AUDIT_INTENT = "private_audit";
export const PUBLIC_SCORECARD_THRESHOLD = 75;
export const PRIVATE_AUDITED_REPO_LABEL = "Private repository";
export const PRODUCTION_AUDIT_UPDATED_EVENT = "provix:production-audit-updated";
export const DOSSIER_PUBLISHED_EVENT = "provix:dossier-published";
export const OWNERSHIP_UNVERIFIED_LABEL = "Ownership Unverified";
export const OWNERSHIP_UNVERIFIED_MESSAGE =
  "Only repos you have authored commits on can be displayed to employers.";

export type DossierVerificationStatus = "verified" | "unverified";

export type ProductionAuditBreakdown = {
  architecture_score: number;
  ci_cd_score: number;
  test_density: number;
  error_handling: number;
  audited_repo_url: string;
  audited_at: string;
};

export type ProductionAuditClaim = {
  production_score: number;
  audit_breakdown: ProductionAuditBreakdown;
  is_audit_verified: true;
  is_publicly_visible: boolean;
};

export type ProductionAuditRecord = {
  productionScore: number;
  breakdown: ProductionAuditBreakdown;
  isAuditVerified: boolean;
  isPubliclyVisible: boolean;
  verificationStatus: DossierVerificationStatus;
};

export function parseDossierVerificationStatus(
  value: unknown
): DossierVerificationStatus {
  return value === "verified" ? "verified" : "unverified";
}

export function isVerifiedDossier(
  record: Pick<ProductionAuditRecord, "verificationStatus"> | null | undefined
): boolean {
  return record?.verificationStatus === "verified";
}

export type ProductionAuditHistoryEntry = {
  id: string;
  productionScore: number;
  auditedRepoUrl: string;
  auditedAt: string;
  ciCdScore: number;
  testDensity: number;
  errorHandling: number;
  createdAt: string;
};

export function canPublishProductionScore(score: number): boolean {
  return clampScore0to100(score) >= PUBLIC_SCORECARD_THRESHOLD;
}

export function resolvePublicScorecardVisibility(
  score: number,
  requestedVisible: boolean
): boolean {
  return requestedVisible && canPublishProductionScore(score);
}

export function employerVisibleProductionAudit(
  record: ProductionAuditRecord | null | undefined
): ProductionAuditRecord | null {
  if (!isVerifiedDossier(record) || !record?.isPubliclyVisible) {
    return null;
  }
  if (!canPublishProductionScore(record.productionScore)) {
    return null;
  }
  return record;
}

export function buildProductionAuditBreakdown(input: {
  githubUrl: string;
  filesystem?: RepoFilesystemEvidence | null;
  scoreCap?: ScoreCapAudit | null;
  auditedAt?: string;
}): ProductionAuditBreakdown {
  const metrics = computeProductionAuditMetrics(input.filesystem);

  if (metrics.evidence.inspected) {
    return {
      architecture_score: metrics.architecture,
      ci_cd_score: metrics.devops,
      test_density: metrics.testing,
      error_handling: metrics.resilience,
      audited_repo_url: input.githubUrl.trim(),
      audited_at: input.auditedAt ?? new Date().toISOString(),
    };
  }

  // No inspected tree: scoreCap is only a boolean presence signal.
  const testsPresent = Boolean(input.scoreCap?.coreArtifacts.tests);
  const ciPresent = Boolean(input.scoreCap?.coreArtifacts.ci);
  const errorPresent = Boolean(input.scoreCap?.coreArtifacts.error_handling);

  return {
    architecture_score: 0,
    ci_cd_score: ciPresent ? 55 : 0,
    test_density: testsPresent ? 40 : 0,
    error_handling: errorPresent ? 55 : 0,
    audited_repo_url: input.githubUrl.trim(),
    audited_at: input.auditedAt ?? new Date().toISOString(),
  };
}

export function buildProductionAuditClaim(input: {
  score: number;
  githubUrl: string;
  filesystem?: RepoFilesystemEvidence | null;
  scoreCap?: ScoreCapAudit | null;
  isPubliclyVisible?: boolean;
}): ProductionAuditClaim {
  const production_score = clampScore0to100(input.score);
  return {
    production_score,
    audit_breakdown: buildProductionAuditBreakdown(input),
    is_audit_verified: true,
    is_publicly_visible: resolvePublicScorecardVisibility(
      production_score,
      Boolean(input.isPubliclyVisible)
    ),
  };
}

export function parseProductionAuditBreakdown(
  value: unknown
): ProductionAuditBreakdown | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const repo =
    typeof record.audited_repo_url === "string"
      ? record.audited_repo_url.trim()
      : "";
  const auditedAt =
    typeof record.audited_at === "string" ? record.audited_at.trim() : "";

  if (!repo) {
    return null;
  }

  return {
    architecture_score: clampScore0to100(record.architecture_score),
    ci_cd_score: clampScore0to100(record.ci_cd_score),
    test_density: clampScore0to100(record.test_density),
    error_handling: clampScore0to100(record.error_handling),
    audited_repo_url: repo,
    audited_at: auditedAt || new Date().toISOString(),
  };
}

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

  return {
    productionScore,
    breakdown: breakdown ?? {
      architecture_score: 0,
      ci_cd_score: 0,
      test_density: 0,
      error_handling: 0,
      audited_repo_url: "",
      audited_at: "",
    },
    isAuditVerified,
    isPubliclyVisible:
      isAuditVerified &&
      resolvePublicScorecardVisibility(
        productionScore,
        row.is_publicly_visible === true
      ),
    verificationStatus,
  };
}

export function getProductionScoreBadge(score: number): {
  label: string;
  className: string;
} | null {
  if (!canPublishProductionScore(score)) {
    return null;
  }

  return {
    label: "Verified",
    className:
      "bg-emerald-500/10 text-emerald-400 border-emerald-500/25",
  };
}

export function productionScoreBadgeClass(score: number): string {
  return canPublishProductionScore(score)
    ? "text-emerald-300 bg-emerald-500/10 border-emerald-500/30"
    : "text-zinc-300 bg-white/5 border-white/10";
}

export function formatAuditedRepoLabel(url: string): string {
  const trimmed = url.trim();
  if (!trimmed || trimmed === PRIVATE_AUDITED_REPO_LABEL) {
    return PRIVATE_AUDITED_REPO_LABEL;
  }

  const parsed = parseGitHubUrl(trimmed);
  if (!parsed) {
    return trimmed || "Public repository";
  }

  return parsed.repo ? `${parsed.owner}/${parsed.repo}` : parsed.owner;
}

export function formatAuditedAt(value: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return "";
  }

  return new Date(parsed).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

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

export function clearPendingProductionAudit(): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(PENDING_PRODUCTION_AUDIT_KEY);
  } catch {
    // Ignore storage failures.
  }
}

export function claimAuditLoginHref(): string {
  return `/login?intent=${CLAIM_AUDIT_INTENT}&next=${encodeURIComponent("/dashboard")}`;
}

export function privateAuditLoginHref(): string {
  return `/login?next=${encodeURIComponent(`/dashboard?intent=${PRIVATE_AUDIT_INTENT}`)}`;
}

export function redactPrivateAuditedRepoUrl(url: string | null | undefined): string {
  const trimmed = url?.trim() ?? "";
  if (!trimmed) {
    return PRIVATE_AUDITED_REPO_LABEL;
  }
  return trimmed;
}

export function isPrivateAuditedRepoLabel(url: string | null | undefined): boolean {
  const trimmed = url?.trim() ?? "";
  return !trimmed || trimmed === PRIVATE_AUDITED_REPO_LABEL;
}

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

export function notifyProductionAuditUpdated(record: ProductionAuditRecord): void {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent(PRODUCTION_AUDIT_UPDATED_EVENT, { detail: record })
  );
}

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
      "id, role, profile_slug, verification_status, is_audit_verified, production_score, audit_breakdown, is_publicly_visible, github_verified"
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
  const canPublish = isVerified && canPublishProductionScore(productionScore);
  const githubVerified = roleRow?.github_verified === true;

  if (enrollInTalentPool && canPublish) {
    payload.is_in_talent_pool = true;
    payload.is_publicly_visible = true;
    if (githubVerified) {
      payload.is_visible_in_pool = true;
      payload.visible_to_employers = true;
    }
  } else if (publishRequested && canPublish) {
    payload.is_publicly_visible = true;
    if (githubVerified) {
      payload.is_visible_in_pool = true;
      payload.visible_to_employers = true;
    }
  } else if (hideRequested || !canPublish) {
    payload.is_publicly_visible = false;
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

export function parseProductionAuditHistoryRow(
  row: Record<string, unknown> | null | undefined
): ProductionAuditHistoryEntry | null {
  if (!row || typeof row.id !== "string") {
    return null;
  }

  const auditedRepoUrl =
    typeof row.audited_repo_url === "string" ? row.audited_repo_url : "";
  const auditedAt =
    typeof row.audited_at === "string"
      ? row.audited_at
      : typeof row.created_at === "string"
        ? row.created_at
        : "";
  const createdAt =
    typeof row.created_at === "string" ? row.created_at : auditedAt;

  return {
    id: row.id,
    productionScore: clampScore0to100(row.production_score),
    auditedRepoUrl,
    auditedAt,
    ciCdScore: clampScore0to100(row.ci_cd_score),
    testDensity: clampScore0to100(row.test_density),
    errorHandling: clampScore0to100(row.error_handling),
    createdAt,
  };
}

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

  if (nextVisible && roleRow?.github_verified === true) {
    payload.is_visible_in_pool = true;
    payload.visible_to_employers = true;
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

export type ClaimPendingResult = {
  record: ProductionAuditRecord | null;
  error: string | null;
  enrolledInTalentPool: boolean;
  profileSlug: string | null;
};

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

  const nextClaim: ProductionAuditClaim = {
    ...pending,
    is_publicly_visible:
      pending.is_publicly_visible ||
      canPublishProductionScore(pending.production_score),
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

export async function claimPendingProductionAudit(): Promise<ProductionAuditRecord | null> {
  const result = await claimPendingProductionAuditResult();
  return result.record;
}
