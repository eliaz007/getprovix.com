import { clampScore0to100 } from "@/lib/score-scale";

/** Dual evaluation modes for roster / sprint contracting audits. */
export type AuditMode = "contract" | "fulltime";

export const DEFAULT_AUDIT_MODE: AuditMode = "contract";

export const AUDIT_MODE_OPTIONS = [
  {
    value: "contract" as const,
    label: "Contract Work (Speed & Architecture)",
  },
  {
    value: "fulltime" as const,
    label: "Full-Time Work (Enterprise & Tests)",
  },
] as const;

/** Persistence keys used by the file-tree scorer. */
export type AuditPillarKey =
  | "architecture"
  | "resilience"
  | "devops"
  | "testing";

export type AuditModeWeights = Record<AuditPillarKey, number>;

/** Founder-facing category scores in the structured evaluation response. */
export type EvaluationBreakdown = {
  architecture: number;
  security: number;
  tooling: number;
  testing: number;
};

export type ModeAwareEvaluation = {
  overallScore: number;
  auditMode: AuditMode;
  tier: string;
  breakdown: EvaluationBreakdown;
};

/** Full-time: enterprise maintainability, tests, and CI dominate. */
export const FULLTIME_WEIGHTS: AuditModeWeights = {
  architecture: 0.3,
  resilience: 0.25,
  devops: 0.15,
  testing: 0.3,
};

/**
 * Contract: velocity + clean TypeScript first.
 * Missing error.tsx / thin tests are polish inside the smaller 15% testing bucket
 * and a moderated security pillar — not fatal vetoes.
 */
export const CONTRACT_WEIGHTS: AuditModeWeights = {
  architecture: 0.45,
  resilience: 0.25,
  devops: 0.15,
  testing: 0.15,
};

export const AUDIT_MODE_WEIGHTS: Record<AuditMode, AuditModeWeights> = {
  fulltime: FULLTIME_WEIGHTS,
  contract: CONTRACT_WEIGHTS,
};

export function isAuditMode(value: unknown): value is AuditMode {
  return value === "contract" || value === "fulltime";
}

export function normalizeAuditMode(value: unknown): AuditMode {
  if (typeof value !== "string") {
    return DEFAULT_AUDIT_MODE;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "full-time" || normalized === "full_time") {
    return "fulltime";
  }
  if (isAuditMode(normalized)) {
    return normalized;
  }
  return DEFAULT_AUDIT_MODE;
}

export function weightsForAuditMode(mode: AuditMode): AuditModeWeights {
  return AUDIT_MODE_WEIGHTS[mode];
}

/** Contract-mode readiness titles (Founder Verdict badge uses the same bands). */
export const CONTRACT_TIER_ELITE = "Elite Sprint Contractor";
export const CONTRACT_TIER_VERIFIED = "Verified Sprint Builder";
export const CONTRACT_TIER_SUPERVISED = "Supervised Feature Builder";
export const CONTRACT_TIER_HARDENING = "Needs Hardening";

export function assignAuditTier(mode: AuditMode, score: number): string {
  const s = clampScore0to100(score);
  if (mode === "fulltime") {
    if (s >= 80) {
      return "Production-Grade / Core Lead";
    }
    if (s >= 70) {
      return "Mid/Senior Production-Ready";
    }
    return "Needs Refinement";
  }
  if (s >= 80) {
    return CONTRACT_TIER_ELITE;
  }
  if (s >= 72) {
    return CONTRACT_TIER_VERIFIED;
  }
  if (s >= 60) {
    return CONTRACT_TIER_SUPERVISED;
  }
  return CONTRACT_TIER_HARDENING;
}

/**
 * Mode-specific pillar shaping before weighting.
 * Contract: missing tests / soft resilience get polish floors so they cannot
 * veto a clean architecture + tooling repo.
 * Full-time: keep harsh zeros for missing Vitest/Playwright and CI workflows.
 */
export function shapePillarsForMode(
  mode: AuditMode,
  parts: {
    architecture: number;
    testing: number;
    devops: number;
    resilience: number;
  }
): {
  architecture: number;
  testing: number;
  devops: number;
  resilience: number;
} {
  const architecture = clampScore0to100(parts.architecture);
  let resilience = clampScore0to100(parts.resilience);
  let testing = clampScore0to100(parts.testing);
  let devops = clampScore0to100(parts.devops);

  if (mode === "contract") {
    if (testing < 55) {
      testing = 55;
    }
    if (devops < 35) {
      devops = Math.max(devops, 35);
    }
    // Missing error.tsx / thin async wrappers are polish when architecture is solid.
    if (architecture >= 75 && resilience < 60) {
      resilience = 60;
    }
  }

  return { architecture, testing, devops, resilience };
}

/**
 * Contract mode: solid architecture + tooling must stay ≥ 70 even when
 * testing / resilience are only polish-level.
 */
export function applyContractScoreFloor(
  mode: AuditMode,
  score: number,
  parts: {
    architecture: number;
    testing: number;
    devops: number;
    resilience: number;
  }
): number {
  if (mode !== "contract") {
    return clampScore0to100(score);
  }
  const solidCore =
    parts.architecture >= 75 &&
    parts.devops >= 50 &&
    parts.testing < 75;
  if (!solidCore) {
    return clampScore0to100(score);
  }
  return clampScore0to100(Math.max(score, 70));
}

export function weightedScoreForMode(
  mode: AuditMode,
  parts: {
    architecture: number;
    testing: number;
    devops: number;
    resilience: number;
  }
): number {
  const shaped = shapePillarsForMode(mode, parts);
  const weights = weightsForAuditMode(mode);
  const raw = clampScore0to100(
    Math.round(
      shaped.architecture * weights.architecture +
        shaped.testing * weights.testing +
        shaped.devops * weights.devops +
        shaped.resilience * weights.resilience
    )
  );
  return applyContractScoreFloor(mode, raw, shaped);
}

/**
 * Map a historical (or live) audit into both mode scores for trend charts.
 * Prefer explicit dual scores; otherwise recompute from pillars; if only a
 * single headline exists, mirror it onto both series so coordinates stay valid.
 */
export function deriveDualModeScores(input: {
  productionScore?: number;
  contractScore?: number | null;
  fullTimeScore?: number | null;
  architecture?: number | null;
  testing?: number | null;
  devops?: number | null;
  resilience?: number | null;
}): { contractScore: number; fullTimeScore: number } {
  const headline = clampScore0to100(input.productionScore ?? 0);
  const hasExplicit =
    typeof input.contractScore === "number" &&
    Number.isFinite(input.contractScore) &&
    typeof input.fullTimeScore === "number" &&
    Number.isFinite(input.fullTimeScore);
  if (hasExplicit) {
    return {
      contractScore: clampScore0to100(input.contractScore),
      fullTimeScore: clampScore0to100(input.fullTimeScore),
    };
  }

  const testing = clampScore0to100(input.testing ?? 0);
  const devops = clampScore0to100(input.devops ?? 0);
  const resilience = clampScore0to100(input.resilience ?? 0);
  const hasPillars = testing > 0 || devops > 0 || resilience > 0;

  if (!hasPillars) {
    return { contractScore: headline, fullTimeScore: headline };
  }

  let architecture =
    typeof input.architecture === "number" && Number.isFinite(input.architecture)
      ? clampScore0to100(input.architecture)
      : null;

  if (architecture == null) {
    // Back-solve architecture assuming the stored headline used Contract weights.
    const residual =
      headline - resilience * 0.25 - devops * 0.15 - testing * 0.15;
    architecture = clampScore0to100(residual / 0.45);
  }

  const parts = { architecture, testing, devops, resilience };
  return {
    contractScore: weightedScoreForMode("contract", parts),
    fullTimeScore: weightedScoreForMode("fulltime", parts),
  };
}

export function buildEvaluationBreakdown(parts: {
  architecture: number;
  testing: number;
  devops: number;
  resilience: number;
}): EvaluationBreakdown {
  return {
    architecture: clampScore0to100(parts.architecture),
    security: clampScore0to100(parts.resilience),
    tooling: clampScore0to100(parts.devops),
    testing: clampScore0to100(parts.testing),
  };
}

export function buildModeAwareEvaluation(
  mode: AuditMode,
  parts: {
    architecture: number;
    testing: number;
    devops: number;
    resilience: number;
  }
): ModeAwareEvaluation {
  const overallScore = weightedScoreForMode(mode, parts);
  return {
    overallScore,
    auditMode: mode,
    tier: assignAuditTier(mode, overallScore),
    breakdown: buildEvaluationBreakdown(parts),
  };
}

export function auditModeLabel(mode: AuditMode): string {
  return mode === "fulltime"
    ? "Full-Time Work (Enterprise & Tests)"
    : "Contract Work (Speed & Architecture)";
}

/** Injected into the Gemini system prompt for the selected mode. */
export function buildAuditModeRubricPrompt(mode: AuditMode): string {
  if (mode === "fulltime") {
    return `EVALUATION MODE: fulltime (permanent / core engineering hire)
Prioritize enterprise maintainability, automated test coverage, error boundaries, and strict CI/CD. No polish floors — sparse tests and missing error.tsx must lower the headline score.
Weighted score = Math.round(architecture * 0.30 + testing * 0.30 + security * 0.25 + tooling * 0.15).
- Code Architecture & Clean Patterns (30%, key: architecture)
- Automated Testing & CI/CD (30%, key: testing) — STRICT volume curve: 1–5 suites score 20–35, 6–24 score 35–48, and ≥25 verified suites floor around 50 then scale toward 90+ with route/API/E2E coverage (large apps are not crushed by a low test/source ratio). Missing Vitest/Jest/Playwright suites or missing .github/workflows must heavily lower this pillar.
- Security & Resilience (25%, key: resilience) — STRICT: web apps missing error.tsx / error boundaries deduct −30 from this pillar. No structure floor.
- Production Tooling & Linters (15%, key: devops)
Tiers: "Production-Grade / Core Lead" (>= 80), "Mid/Senior Production-Ready" (70-79), "Needs Refinement" (< 70).
Copy overallScore, auditMode, tier, and breakdown from deterministicMetrics. Do not recompute.`;
  }

  return `EVALUATION MODE: contract (sprint velocity / MVP / rapid feature builds)
Prioritize fast feature delivery, clean TypeScript, and safe data access. Missing error.tsx or thin test harnesses are polish recommendations — not fatal score killers.
Weighted score = Math.round(architecture * 0.45 + security * 0.25 + tooling * 0.15 + testing * 0.15).
- Architecture & Code Hygiene (45%, key: architecture): Strict TypeScript, modular structure, clean component separation.
- Security & Safe Data Access (25%, key: resilience): Auth hygiene, safe queries/RLS signals, input validation. Missing error boundaries are a moderate ding with a ~50 floor when structure is clean.
- DevOps & Tooling (15%, key: devops): Build scripts, ESLint/Prettier, package hygiene; thin CI still earns a modest baseline.
- Testing & Resilience polish (15%, key: testing): BONUS / polish. Missing tests or error.tsx must NOT drag an otherwise clean Arch+DevOps codebase out of Verified Sprint (72–79) territory.
Tiers: "Elite Sprint Contractor" (>= 80), "Verified Sprint Builder" (72-79), "Supervised Feature Builder" (60-71), "Needs Hardening" (< 60).
Copy overallScore, auditMode, tier, and breakdown from deterministicMetrics. Do not recompute.`;
}
