import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import {
  listProductionAuditHistory,
  parseProductionAuditBreakdown,
  parseProductionAuditFromProfileRow,
  persistProfileProductionAudit,
  persistScorecardVisibility,
  resolvePublicScorecardVisibility,
  type ProductionAuditClaim,
} from "@/lib/production-audit";
import { clampScore0to100 } from "@/lib/score-scale";

export const runtime = "nodejs";

function parseVisibilityFlag(value: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }
  return undefined;
}

export async function GET(request: Request) {
  const access = await requireApiUser(request);
  if (access instanceof NextResponse) {
    return access;
  }

  const { data: profile } = await access.supabase
    .from("profiles")
    .select(
      "production_score, audit_breakdown, is_audit_verified, is_publicly_visible, role"
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

export async function POST(request: Request) {
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
  const isPubliclyVisible = resolvePublicScorecardVisibility(
    productionScore,
    parseVisibilityFlag(record.is_publicly_visible) ?? false
  );
  const claim: ProductionAuditClaim = {
    production_score: productionScore,
    audit_breakdown: breakdown,
    is_audit_verified: true,
    is_publicly_visible: isPubliclyVisible,
  };

  const { error } = await persistProfileProductionAudit(
    access.supabase,
    access.user.id,
    claim,
    { isPubliclyVisible }
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
    audit_breakdown: claim.audit_breakdown,
    is_audit_verified: true,
    is_publicly_visible: claim.is_publicly_visible,
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

export async function PATCH(request: Request) {
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

  const { error, record: nextRecord } = await persistScorecardVisibility(
    access.supabase,
    access.user.id,
    isPubliclyVisible
  );

  if (error) {
    const status = nextRecord ? 400 : 500;
    return NextResponse.json({ error }, { status });
  }

  return NextResponse.json({
    production_score: nextRecord?.productionScore ?? null,
    audit_breakdown: nextRecord?.breakdown ?? null,
    is_audit_verified: Boolean(nextRecord?.isAuditVerified),
    is_publicly_visible: Boolean(nextRecord?.isPubliclyVisible),
  });
}
