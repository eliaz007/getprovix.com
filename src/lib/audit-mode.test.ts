import { describe, expect, it } from "vitest";
import {
  assignAuditTier,
  AUDIT_MODE_WEIGHTS,
  buildModeAwareEvaluation,
  deriveDualModeScores,
  normalizeAuditMode,
  weightedScoreForMode,
} from "@/lib/audit-mode";

describe("dual-mode audit evaluation", () => {
  it("normalizes auditMode aliases to contract | fulltime", () => {
    expect(normalizeAuditMode("contract")).toBe("contract");
    expect(normalizeAuditMode("fulltime")).toBe("fulltime");
    expect(normalizeAuditMode("full-time")).toBe("fulltime");
    expect(normalizeAuditMode("unknown")).toBe("contract");
  });

  it("uses distinct weight tables per mode", () => {
    expect(AUDIT_MODE_WEIGHTS.fulltime).toEqual({
      architecture: 0.3,
      resilience: 0.25,
      devops: 0.15,
      testing: 0.3,
    });
    expect(AUDIT_MODE_WEIGHTS.contract).toEqual({
      architecture: 0.45,
      resilience: 0.25,
      devops: 0.15,
      testing: 0.15,
    });
  });

  it("assigns mode-specific tiers", () => {
    expect(assignAuditTier("fulltime", 82)).toBe(
      "Production-Grade / Core Lead"
    );
    expect(assignAuditTier("fulltime", 74)).toBe(
      "Mid/Senior Production-Ready"
    );
    expect(assignAuditTier("fulltime", 60)).toBe("Needs Refinement");
    expect(assignAuditTier("contract", 82)).toBe("Elite Sprint Contractor");
    expect(assignAuditTier("contract", 76)).toBe("Verified Sprint Builder");
    expect(assignAuditTier("contract", 68)).toBe("Supervised Feature Builder");
    expect(assignAuditTier("contract", 50)).toBe("Needs Hardening");
  });

  it("keeps solid contract codebases at or above 70 with thin tests", () => {
    const score = weightedScoreForMode("contract", {
      architecture: 82,
      testing: 0,
      devops: 55,
      resilience: 80,
    });
    expect(score).toBeGreaterThanOrEqual(70);
    expect(assignAuditTier("contract", score)).not.toBe("Needs Hardening");
  });

  it("lands Arch 82 / DevOps 90 / Test 68 as Verified Sprint Builder with soft resilience", () => {
    const score = weightedScoreForMode("contract", {
      architecture: 82,
      testing: 68,
      devops: 90,
      resilience: 15,
    });
    expect(score).toBeGreaterThanOrEqual(72);
    expect(score).toBeLessThanOrEqual(82);
    expect(assignAuditTier("contract", score)).toBe("Verified Sprint Builder");
  });

  it("penalizes missing tests more under fulltime weights", () => {
    const parts = {
      architecture: 82,
      testing: 0,
      devops: 0,
      resilience: 80,
    };
    const contract = weightedScoreForMode("contract", parts);
    const fulltime = weightedScoreForMode("fulltime", parts);
    expect(fulltime).toBeLessThan(contract);
  });

  it("keeps Full-Time below Mid/Senior for sparse tests and soft resilience", () => {
    // Mirrors carfax-like pillars after Full-Time density + −30 boundary scoring.
    const fulltime = weightedScoreForMode("fulltime", {
      architecture: 82,
      testing: 31,
      devops: 90,
      resilience: 54,
    });
    const contract = weightedScoreForMode("contract", {
      architecture: 82,
      testing: 68,
      devops: 90,
      resilience: 69,
    });
    expect(fulltime).toBeGreaterThanOrEqual(58);
    expect(fulltime).toBeLessThanOrEqual(64);
    expect(contract).toBeGreaterThanOrEqual(74);
    expect(contract).toBeLessThanOrEqual(82);
    expect(assignAuditTier("fulltime", fulltime)).toBe("Needs Refinement");
    expect(assignAuditTier("contract", contract)).toBe("Verified Sprint Builder");
  });

  it("derives dual trend scores from pillars or mirrors a single headline", () => {
    const dual = deriveDualModeScores({
      productionScore: 76,
      architecture: 82,
      testing: 68,
      devops: 90,
      resilience: 69,
    });
    expect(dual.contractScore).toBeGreaterThan(dual.fullTimeScore);
    expect(dual.contractScore).toBeGreaterThanOrEqual(72);

    const mirrored = deriveDualModeScores({ productionScore: 81 });
    expect(mirrored).toEqual({ contractScore: 81, fullTimeScore: 81 });
  });

  it("returns structured evaluation payload fields", () => {
    const evaluation = buildModeAwareEvaluation("contract", {
      architecture: 88,
      testing: 70,
      devops: 72,
      resilience: 84,
    });
    expect(evaluation.auditMode).toBe("contract");
    expect(evaluation.breakdown).toEqual({
      architecture: 88,
      security: 84,
      tooling: 72,
      testing: 70,
    });
    expect(evaluation.overallScore).toBeGreaterThan(0);
    expect(evaluation.tier).toBeTruthy();
  });
});
