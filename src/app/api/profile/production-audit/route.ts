import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/admin-access";
import { requireApiUser } from "@/lib/api-auth";
import {
  REPO_OWNERSHIP_ERROR,
  verifyGitHubRepoOwnership,
} from "@/lib/github-ownership";
import {
  PUBLIC_SCORECARD_THRESHOLD,
  PRIVATE_AUDITED_REPO_LABEL,
  canPublishProductionScore,
  listProductionAuditHistory,
  parseProductionAuditBreakdown,
  parseProductionAuditFromProfileRow,
  persistProfileProductionAudit,
  persistScorecardVisibility,
  resolvePublicScorecardVisibility,
  type ProductionAuditClaim,
} from "@/lib/production-audit";
import { parseGitHubUrl } from "@/lib/validate-github-url";
import { clampScore0to100 } from "@/lib/score-scale";

export const runtime = "nodejs";

function jsonServerError(error: unknown, fallback: string) {
  console.error(error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}

export async function GET(request: Request) {
  try {
    return await getProductionAudit(request);
  } catch (error) {
    return jsonServerError(error, "Could not load the production audit.");
  }
}

export async function POST(request: Request) {
  try {
    return await postProductionAudit(request);
  } catch (error) {
    return jsonServerError(error, "Could not save the production audit.");
  }
}

export async function PATCH(request: Request) {
  try {
    return await patchProductionAudit(request);
  } catch (error) {
    return jsonServerError(error, "Could not update scorecard visibility.");
  }
}

function parseVisibilityFlag(value: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }
  return undefined;
}

async function getProductionAudit(request: Request) {
  const access = await requireApiUser(request);
  if (access instanceof NextResponse) {
    return access;
  }

  const { data: profile } = await access.supabase
    .from("profiles")
    .select(
      "production_score, audit_breakdown, is_audit_verified, is_publicly_visible, verification_status, role"
    )
    .or(`id.eq.${access.user.id},user_id.eq.${access.user.id}`)
    .limit(1)
    .maybeSingle();

  const history = await listProductionAuditHistory(
    access.supabase,
    access.user.id
  );
  const current = parseProductionAuditFromProfileRow(profile);

  return NextResponse.json({
    current: current
      ? {
          production_score: current.productionScore,
          audit_breakdown: current.breakdown,
          is_audit_verified: current.isAuditVerified,
          is_publicly_visible: current.isPubliclyVisible,
          verification_status: current.verificationStatus,
        }
      : null,
    history: history.map((entry) => ({
      id: entry.id,
      production_score: entry.productionScore,
      audited_repo_url: entry.auditedRepoUrl,
      audited_at: entry.auditedAt,
      ci_cd_score: entry.ciCdScore,
      test_density: entry.testDensity,
      error_handling: entry.errorHandling,
      created_at: entry.createdAt,
    })),
  });
}

async function postProductionAudit(request: Request) {
  const access = await requireApiUser(request);
  if (access instanceof NextResponse) {
    return access;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  const breakdown = parseProductionAuditBreakdown(record?.audit_breakdown);
  if (!record || !breakdown) {
    return NextResponse.json(
      { error: "A production audit payload is required." },
      { status: 400 }
    );
  }

  const productionScore = clampScore0to100(record.production_score);
  const repoUrl = breakdown.audited_repo_url.trim();
  const parsedRepo = parseGitHubUrl(repoUrl);
  const isPublicGitHubClaim = Boolean(
    parsedRepo?.owner &&
      parsedRepo.repo &&
      repoUrl !== PRIVATE_AUDITED_REPO_LABEL
  );

  if (isPublicGitHubClaim) {
    const ownership = await verifyGitHubRepoOwnership({
      user: access.user,
      repoUrl,
    });
    if (!ownership.verified) {
      const rejectedClaim: ProductionAuditClaim = {
        production_score: productionScore,
        audit_breakdown: breakdown,
        is_audit_verified: true,
        is_publicly_visible: false,
      };
      await persistProfileProductionAudit(
        access.supabase,
        access.user.id,
        rejectedClaim,
        {
          isPubliclyVisible: false,
          enrollInTalentPool: false,
          verificationStatus: "unverified",
        }
      );
      return NextResponse.json(
        {
          error: REPO_OWNERSHIP_ERROR,
          verified: false,
          verification_status: "unverified",
        },
        { status: 403 }
      );
    }
  }

  const qualifiesForTalentPool =
    isPublicGitHubClaim && canPublishProductionScore(productionScore);
  const requestedVisible = parseVisibilityFlag(record.is_publicly_visible);
  const isPubliclyVisible = resolvePublicScorecardVisibility(
    productionScore,
    qualifiesForTalentPool ? true : requestedVisible ?? false
  );
  const claim: ProductionAuditClaim = {
    production_score: productionScore,
    audit_breakdown: breakdown,
    is_audit_verified: true,
    is_publicly_visible: isPubliclyVisible,
  };

  const { error, profileSlug } = await persistProfileProductionAudit(
    access.supabase,
    access.user.id,
    claim,
    {
      isPubliclyVisible,
      enrollInTalentPool: qualifiesForTalentPool,
      verificationStatus: isPublicGitHubClaim ? "verified" : undefined,
    }
  );

  if (error) {
    return NextResponse.json({ error }, { status: 500 });
  }

  const history = await listProductionAuditHistory(
    access.supabase,
    access.user.id
  );

  return NextResponse.json({
    production_score: claim.production_score,
    audit_score: claim.production_score,
    audit_breakdown: claim.audit_breakdown,
    is_audit_verified: true,
    is_publicly_visible: claim.is_publicly_visible,
    is_in_talent_pool: qualifiesForTalentPool,
    verification_status: isPublicGitHubClaim ? "verified" : "unverified",
    enrolled_in_talent_pool: qualifiesForTalentPool,
    profile_slug: profileSlug ?? null,
    threshold: PUBLIC_SCORECARD_THRESHOLD,
    history: history.map((entry) => ({
      id: entry.id,
      production_score: entry.productionScore,
      audited_repo_url: entry.auditedRepoUrl,
      audited_at: entry.auditedAt,
      ci_cd_score: entry.ciCdScore,
      test_density: entry.testDensity,
      error_handling: entry.errorHandling,
      created_at: entry.createdAt,
    })),
  });
}

async function patchProductionAudit(request: Request) {
  const access = await requireApiUser(request);
  if (access instanceof NextResponse) {
    return access;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  const isPubliclyVisible = parseVisibilityFlag(record?.is_publicly_visible);
  if (isPubliclyVisible === undefined) {
    return NextResponse.json(
      { error: "is_publicly_visible is required." },
      { status: 400 }
    );
  }

  let result = await persistScorecardVisibility(
    access.supabase,
    access.user.id,
    isPubliclyVisible
  );

  if (result.error) {
    const admin = createServiceRoleClient();
    if (admin) {
      const adminResult = await persistScorecardVisibility(
        admin,
        access.user.id,
        isPubliclyVisible
      );
      if (!adminResult.error) {
        result = adminResult;
      }
    }
  }

  const { error, record: nextRecord } = result;

  if (error) {
    const status = nextRecord ? 400 : 500;
    return NextResponse.json({ error }, { status });
  }

  return NextResponse.json({
    production_score: nextRecord?.productionScore ?? null,
    audit_breakdown: nextRecord?.breakdown ?? null,
    is_audit_verified: Boolean(nextRecord?.isAuditVerified),
    is_publicly_visible: Boolean(nextRecord?.isPubliclyVisible),
    verification_status: nextRecord?.verificationStatus ?? "unverified",
  });
}
