import type { AuditResult } from "@/app/api/audit/route";
import { emptyScoreCapAudit } from "@/lib/repo-filesystem";
import { createClient } from "@/utils/supabase/server";

const AUDIT_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type SharedAuditView = {
  id: string;
  result: AuditResult;
  repoName: string | null;
  repoUrl: string | null;
};

export function isSharedAuditId(value: string): boolean {
  return AUDIT_ID.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function parseSharedAuditPayload(
  id: string,
  payload: unknown
): SharedAuditView | null {
  if (!isRecord(payload) || !isRecord(payload.result)) {
    return null;
  }

  const raw = payload.result;
  if (typeof raw.score !== "number" || !Number.isFinite(raw.score)) {
    return null;
  }
  if (!isRecord(raw.metrics)) {
    return null;
  }

  const scoreCap = isRecord(raw.scoreCap)
    ? (raw.scoreCap as AuditResult["scoreCap"])
    : emptyScoreCapAudit(raw.score);

  const result: AuditResult = {
    score: raw.score,
    strengths: Array.isArray(raw.strengths)
      ? raw.strengths.filter((item): item is string => typeof item === "string")
      : [],
    redFlags: Array.isArray(raw.redFlags)
      ? raw.redFlags.filter((item): item is string => typeof item === "string")
      : [],
    recommendations: Array.isArray(raw.recommendations)
      ? raw.recommendations.filter(
          (item): item is string => typeof item === "string"
        )
      : [],
    checks: Array.isArray(raw.checks) ? (raw.checks as AuditResult["checks"]) : [],
    scoreCap,
    metrics: raw.metrics as AuditResult["metrics"],
    filesystem:
      raw.filesystem && isRecord(raw.filesystem)
        ? (raw.filesystem as AuditResult["filesystem"])
        : null,
    commitDates: Array.isArray(raw.commitDates)
      ? raw.commitDates.filter((item): item is string => typeof item === "string")
      : [],
    benchmark:
      raw.benchmark && isRecord(raw.benchmark)
        ? (raw.benchmark as AuditResult["benchmark"])
        : null,
  };

  return {
    id,
    result,
    repoName: typeof payload.repoName === "string" ? payload.repoName : null,
    repoUrl: typeof payload.repoUrl === "string" ? payload.repoUrl : null,
  };
}

export async function getSharedAudit(
  id: string
): Promise<SharedAuditView | null> {
  if (!isSharedAuditId(id)) {
    return null;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("shared_audits")
    .select("id, payload")
    .eq("id", id)
    .maybeSingle();

  if (error || !data || typeof data.id !== "string") {
    if (error) {
      console.error("[shared-audit] public read failed:", error.message);
    }
    return null;
  }

  return parseSharedAuditPayload(data.id, data.payload);
}
