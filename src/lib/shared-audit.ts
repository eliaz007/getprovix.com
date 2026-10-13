import type { AuditResult } from "@/app/api/audit/route";
import {
  assignAuditTier,
  buildEvaluationBreakdown,
  normalizeAuditMode,
} from "@/lib/audit-mode";
import { parseExecutiveBrief } from "@/lib/executive-brief";
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

  const metrics = raw.metrics as AuditResult["metrics"];
  const auditMode = normalizeAuditMode(raw.auditMode);
  const overallScore =
    typeof raw.overallScore === "number" && Number.isFinite(raw.overallScore)
      ? raw.overallScore
      : raw.score;
  const recommendations = Array.isArray(raw.recommendations)
    ? raw.recommendations.filter(
        (item): item is string => typeof item === "string"
      )
    : [];
  const improvements = Array.isArray(raw.improvements)
    ? raw.improvements.filter((item): item is string => typeof item === "string")
    : recommendations;
  const breakdown =
    isRecord(raw.breakdown) &&
    typeof raw.breakdown.architecture === "number" &&
    typeof raw.breakdown.security === "number" &&
    typeof raw.breakdown.tooling === "number" &&
    typeof raw.breakdown.testing === "number"
      ? {
          architecture: raw.breakdown.architecture,
          security: raw.breakdown.security,
          tooling: raw.breakdown.tooling,
          testing: raw.breakdown.testing,
        }
      : buildEvaluationBreakdown({
          architecture: metrics.architecture ?? 0,
          testing: metrics.testing ?? 0,
          devops: metrics.devops ?? 0,
          resilience: metrics.resilience ?? 0,
        });

  const result: AuditResult = {
    score: overallScore,
    overallScore,
    auditMode,
    tier:
      typeof raw.tier === "string" && raw.tier.trim()
        ? raw.tier.trim()
        : assignAuditTier(auditMode, overallScore),
    breakdown,
    summary: typeof raw.summary === "string" ? raw.summary : "",
    strengths: Array.isArray(raw.strengths)
      ? raw.strengths.filter((item): item is string => typeof item === "string")
      : [],
    improvements,
    redFlags: Array.isArray(raw.redFlags)
      ? raw.redFlags.filter((item): item is string => typeof item === "string")
      : [],
    recommendations,
    checks: Array.isArray(raw.checks) ? (raw.checks as AuditResult["checks"]) : [],
    scoreCap,
    metrics,
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
    executiveBrief: parseExecutiveBrief(raw.executiveBrief),
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

  try {
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
  } catch (error) {
    console.error("[shared-audit] public read threw:", error);
    return null;
  }
}
