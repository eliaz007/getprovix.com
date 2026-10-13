import {
  assignAuditTier,
  CONTRACT_TIER_ELITE,
  CONTRACT_TIER_HARDENING,
  CONTRACT_TIER_SUPERVISED,
  CONTRACT_TIER_VERIFIED,
  DEFAULT_AUDIT_MODE,
  normalizeAuditMode,
  type AuditMode,
} from "@/lib/audit-mode";
import { clampScore0to100 } from "@/lib/score-scale";

/** Founder Verdict / Contract tier titles (synced with assignAuditTier). */
export const ROLE_BANDS = [
  CONTRACT_TIER_ELITE,
  CONTRACT_TIER_VERIFIED,
  CONTRACT_TIER_SUPERVISED,
  CONTRACT_TIER_HARDENING,
  "Production-Grade / Core Lead",
  "Mid/Senior Production-Ready",
  "Needs Refinement",
] as const;

export type RecommendedRoleBand = (typeof ROLE_BANDS)[number];

export type ExecutiveBrief = {
  employerSummary: string;
  developerSummary: string;
  recommendedRoleBand: RecommendedRoleBand;
};

/** Talent-network bar — Verified Sprint Builder and above. */
export const ROLE_BAND_SCORE_THRESHOLD = 72;

export function isRecommendedRoleBand(
  value: unknown
): value is RecommendedRoleBand {
  return (
    typeof value === "string" &&
    (ROLE_BANDS as readonly string[]).includes(value)
  );
}

/**
 * Founder Hiring Verdict badge — mirrors mode-aware audit tiers so an 80+
 * Contract score never shows legacy "Mid-Level" / "Early-Stage Generalist".
 */
export function assignRecommendedRoleBand(input: {
  productionScore: number;
  testing?: number;
  resilience?: number;
  auditMode?: AuditMode | string;
}): RecommendedRoleBand {
  const mode = normalizeAuditMode(input.auditMode ?? DEFAULT_AUDIT_MODE);
  const tier = assignAuditTier(mode, input.productionScore);
  if (isRecommendedRoleBand(tier)) {
    return tier;
  }
  return CONTRACT_TIER_HARDENING;
}

function asSummary(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.replace(/\s+/g, " ").trim();
}

export function parseExecutiveBrief(value: unknown): ExecutiveBrief | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const employerSummary = asSummary(record.employerSummary);
  const developerSummary = asSummary(record.developerSummary);
  if (!employerSummary && !developerSummary) {
    return null;
  }
  return {
    employerSummary,
    developerSummary,
    recommendedRoleBand: isRecommendedRoleBand(record.recommendedRoleBand)
      ? record.recommendedRoleBand
      : CONTRACT_TIER_HARDENING,
  };
}

function fallbackSummaries(input: {
  productionScore: number;
  architectureScore: number;
  testScore: number;
  devopsScore: number;
  resilienceScore: number;
  isUpstreamDerivative: boolean;
  recommendedRoleBand: RecommendedRoleBand;
}): Pick<ExecutiveBrief, "employerSummary" | "developerSummary"> {
  const upstream = input.isUpstreamDerivative
    ? " The repository is an upstream fork or generated template, and the headline already includes the 30-point deduction."
    : "";
  return {
    employerSummary: `Headline production score is ${input.productionScore}/100, with architecture ${input.architectureScore}, tests ${input.testScore}, DevOps ${input.devopsScore}, and resilience ${input.resilienceScore}.${upstream} The Founder Verdict is ${input.recommendedRoleBand}.`,
    developerSummary: `Peer review of the file tree: tests are ${input.testScore}/100 and resilience is ${input.resilienceScore}/100.${upstream} The highest-leverage fix is the weaker of those two pillars, because that is what keeps the verdict at ${input.recommendedRoleBand}.`,
  };
}

/** Keep the model's sentences. The role band always comes from the mode tier. */
export function finalizeExecutiveBrief(input: {
  draft: unknown;
  productionScore: number;
  architectureScore: number;
  testScore: number;
  devopsScore: number;
  resilienceScore: number;
  isUpstreamDerivative: boolean;
  auditMode?: AuditMode | string;
}): ExecutiveBrief {
  const recommendedRoleBand = assignRecommendedRoleBand({
    productionScore: input.productionScore,
    testing: input.testScore,
    resilience: input.resilienceScore,
    auditMode: input.auditMode,
  });
  const fallback = fallbackSummaries({
    ...input,
    recommendedRoleBand,
  });
  const parsed = parseExecutiveBrief(input.draft);
  return {
    employerSummary: parsed?.employerSummary || fallback.employerSummary,
    developerSummary: parsed?.developerSummary || fallback.developerSummary,
    recommendedRoleBand,
  };
}

export function deterministicMetricsPayload(input: {
  productionScore: number;
  isUpstreamDerivative: boolean;
  architectureScore: number;
  testScore: number;
  devopsScore: number;
  resilienceScore: number;
  auditMode?: string;
  overallScore?: number;
  tier?: string;
  breakdown?: unknown;
}) {
  const mode = normalizeAuditMode(input.auditMode ?? DEFAULT_AUDIT_MODE);
  const tier =
    input.tier ?? assignAuditTier(mode, input.overallScore ?? input.productionScore);
  return {
    productionScore: input.productionScore,
    overallScore: input.overallScore ?? input.productionScore,
    auditMode: input.auditMode ?? null,
    tier,
    breakdown: input.breakdown ?? null,
    is_upstream_derivative: input.isUpstreamDerivative,
    architectureScore: input.architectureScore,
    testScore: input.testScore,
    devopsScore: input.devopsScore,
    resilienceScore: input.resilienceScore,
    securityScore: input.resilienceScore,
    toolingScore: input.devopsScore,
    roleBandRule:
      mode === "fulltime"
        ? 'Copy tier as recommendedRoleBand. Full-time: "Production-Grade / Core Lead" (>= 80), "Mid/Senior Production-Ready" (70-79), "Needs Refinement" (< 70). Do not invent Mid-Level or Early-Stage Generalist.'
        : 'Copy tier as recommendedRoleBand. Contract: "Elite Sprint Contractor" (>= 80), "Verified Sprint Builder" (72-79), "Supervised Feature Builder" (60-71), "Needs Hardening" (< 60). Do not invent Mid-Level or Early-Stage Generalist.',
  };
}
