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

/**
 * Keep the model's sentences.
 * When preferModelRoleBand is true (job-aware screening), keep Gemini's valid
 * hiring verdict band. Repo metrics remain the fallback / technical-proof band only.
 */
export function finalizeExecutiveBrief(input: {
  draft: unknown;
  productionScore: number;
  architectureScore: number;
  testScore: number;
  devopsScore: number;
  resilienceScore: number;
  isUpstreamDerivative: boolean;
  auditMode?: AuditMode | string;
  /** Default false preserves audit-route metric tiers. Screen job_aware passes true. */
  preferModelRoleBand?: boolean;
}): ExecutiveBrief {
  const metricBand = assignRecommendedRoleBand({
    productionScore: input.productionScore,
    testing: input.testScore,
    resilience: input.resilienceScore,
    auditMode: input.auditMode,
  });
  const parsed = parseExecutiveBrief(input.draft);
  // Prefer an explicitly valid model band when asked; parseExecutiveBrief maps
  // invalid bands to HARDENING, so re-check the raw draft for a real ROLE_BAND.
  const rawBand =
    input.draft &&
    typeof input.draft === "object" &&
    !Array.isArray(input.draft)
      ? (input.draft as Record<string, unknown>).recommendedRoleBand
      : undefined;
  const recommendedRoleBand =
    input.preferModelRoleBand && isRecommendedRoleBand(rawBand)
      ? rawBand
      : metricBand;

  const fallback = fallbackSummaries({
    ...input,
    recommendedRoleBand,
  });
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
  /**
   * When true, roleBandRule tells the model the band is overall hiring fit,
   * not a copy of the technical tier.
   */
  hiringVerdictFromFit?: boolean;
}) {
  const mode = normalizeAuditMode(input.auditMode ?? DEFAULT_AUDIT_MODE);
  const tier =
    input.tier ?? assignAuditTier(mode, input.overallScore ?? input.productionScore);
  const fitRule =
    'recommendedRoleBand is the OVERALL hiring verdict for this candidate vs the target role (bio, experience, skills, JD requirements, with repo audit as technical proof only). Choose from the allowed band strings. Do NOT copy "tier" blindly — a strong repo with a weak JD/profile fit must not get Elite/Core Lead.';
  const metricRule =
    mode === "fulltime"
      ? 'Copy tier as recommendedRoleBand. Full-time: "Production-Grade / Core Lead" (>= 80), "Mid/Senior Production-Ready" (70-79), "Needs Refinement" (< 70). Do not invent Mid-Level or Early-Stage Generalist.'
      : 'Copy tier as recommendedRoleBand. Contract: "Elite Sprint Contractor" (>= 80), "Verified Sprint Builder" (72-79), "Supervised Feature Builder" (60-71), "Needs Hardening" (< 60). Do not invent Mid-Level or Early-Stage Generalist.';
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
    roleBandRule: input.hiringVerdictFromFit ? fitRule : metricRule,
    technicalProofNote:
      "productionScore and pillar scores are the codebase/technical-proof pillar only; they are not the hiring verdict by themselves.",
  };
}
