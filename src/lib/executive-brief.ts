import { clampScore0to100 } from "@/lib/score-scale";

export const ROLE_BANDS = [
  "Intern / Junior",
  "Mid-Level",
  "Early-Stage Generalist",
  "Needs Hardening",
] as const;

export type RecommendedRoleBand = (typeof ROLE_BANDS)[number];

export type ExecutiveBrief = {
  employerSummary: string;
  developerSummary: string;
  recommendedRoleBand: RecommendedRoleBand;
};

/** Talent-network bar. Matches the existing 75 readiness threshold. */
export const ROLE_BAND_SCORE_THRESHOLD = 75;

/** Testing at 65 is the real-coverage band. Token coverage stays under 20. */
export const ROBUST_TEST_SCORE = 65;

/**
 * A missing web error boundary lands at 65. 80 means that ding did not apply
 * and unhandled async calls stayed small.
 */
export const ROBUST_RESILIENCE_SCORE = 80;

export function isRecommendedRoleBand(
  value: unknown
): value is RecommendedRoleBand {
  return (
    typeof value === "string" &&
    (ROLE_BANDS as readonly string[]).includes(value)
  );
}

/**
 * Mid-Level only when the headline clears 75 and both test and error-handling
 * patterns are robust. 75+ with a gap is Early-Stage Generalist. Below 75,
 * a single robust pillar is Intern / Junior. Otherwise Needs Hardening.
 */
export function assignRecommendedRoleBand(input: {
  productionScore: number;
  testing: number;
  resilience: number;
}): RecommendedRoleBand {
  const score = clampScore0to100(input.productionScore);
  const robustTests = input.testing >= ROBUST_TEST_SCORE;
  const robustErrors = input.resilience >= ROBUST_RESILIENCE_SCORE;

  if (score >= ROLE_BAND_SCORE_THRESHOLD && robustTests && robustErrors) {
    return "Mid-Level";
  }
  if (score >= ROLE_BAND_SCORE_THRESHOLD) {
    return "Early-Stage Generalist";
  }
  if (robustTests || robustErrors) {
    return "Intern / Junior";
  }
  return "Needs Hardening";
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
      : "Needs Hardening",
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
    employerSummary: `Headline production score is ${input.productionScore}/100, with architecture ${input.architectureScore}, tests ${input.testScore}, DevOps ${input.devopsScore}, and resilience ${input.resilienceScore}.${upstream} The role band is ${input.recommendedRoleBand} based on the 75-point bar and the test and error-handling scores.`,
    developerSummary: `Peer review of the file tree: tests are ${input.testScore}/100 and resilience is ${input.resilienceScore}/100.${upstream} The highest-leverage fix is the weaker of those two pillars, because that is what keeps the role band at ${input.recommendedRoleBand}.`,
  };
}

/** Keep the model's sentences. The role band always comes from the pillar scores. */
export function finalizeExecutiveBrief(input: {
  draft: unknown;
  productionScore: number;
  architectureScore: number;
  testScore: number;
  devopsScore: number;
  resilienceScore: number;
  isUpstreamDerivative: boolean;
}): ExecutiveBrief {
  const recommendedRoleBand = assignRecommendedRoleBand({
    productionScore: input.productionScore,
    testing: input.testScore,
    resilience: input.resilienceScore,
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
}) {
  return {
    productionScore: input.productionScore,
    is_upstream_derivative: input.isUpstreamDerivative,
    architectureScore: input.architectureScore,
    testScore: input.testScore,
    devopsScore: input.devopsScore,
    resilienceScore: input.resilienceScore,
    roleBandRule:
      "Mid-Level only when productionScore >= 75 and testScore >= 65 and resilienceScore >= 80. Early-Stage Generalist when productionScore >= 75 but tests or resilience miss that bar. Intern / Junior when productionScore < 75 and either testScore >= 65 or resilienceScore >= 80. Otherwise Needs Hardening. Do not invent a different band.",
  };
}
