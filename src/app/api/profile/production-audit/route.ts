import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import {
  parseProductionAuditBreakdown,
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

  return NextResponse.json({
    production_score: claim.production_score,
    audit_breakdown: claim.audit_breakdown,
    is_audit_verified: true,
    is_publicly_visible: claim.is_publicly_visible,
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
