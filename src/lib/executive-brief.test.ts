import { describe, expect, it } from "vitest";
import {
  assignRecommendedRoleBand,
  finalizeExecutiveBrief,
  parseExecutiveBrief,
} from "./executive-brief";

describe("assignRecommendedRoleBand", () => {
  it("maps Contract scores onto Verified / Elite / Supervised bands", () => {
    expect(
      assignRecommendedRoleBand({
        productionScore: 88,
        auditMode: "contract",
      })
    ).toBe("Elite Sprint Contractor");
    expect(
      assignRecommendedRoleBand({
        productionScore: 76,
        auditMode: "contract",
      })
    ).toBe("Verified Sprint Builder");
    expect(
      assignRecommendedRoleBand({
        productionScore: 68,
        auditMode: "contract",
      })
    ).toBe("Supervised Feature Builder");
  });

  it("never labels 80+ Contract scores as Mid-Level or Early-Stage Generalist", () => {
    const band = assignRecommendedRoleBand({
      productionScore: 82,
      testing: 70,
      resilience: 65,
      auditMode: "contract",
    });
    expect(band).toBe("Elite Sprint Contractor");
    expect(band).not.toBe("Mid-Level");
    expect(band).not.toBe("Early-Stage Generalist");
  });

  it("uses Needs Hardening below 60 in Contract mode", () => {
    expect(
      assignRecommendedRoleBand({
        productionScore: 40,
        testing: 10,
        resilience: 50,
        auditMode: "contract",
      })
    ).toBe("Needs Hardening");
  });

  it("mirrors Full-Time tiers when auditMode is fulltime", () => {
    expect(
      assignRecommendedRoleBand({
        productionScore: 82,
        auditMode: "fulltime",
      })
    ).toBe("Production-Grade / Core Lead");
    expect(
      assignRecommendedRoleBand({
        productionScore: 74,
        auditMode: "fulltime",
      })
    ).toBe("Mid/Senior Production-Ready");
  });
});

describe("finalizeExecutiveBrief", () => {
  it("overwrites invalid model bands with the metric tier by default", () => {
    const brief = finalizeExecutiveBrief({
      draft: {
        employerSummary: "Founders should treat this as a scoped product bet.",
        developerSummary: "Split the data client out of the page component.",
        recommendedRoleBand: "Mid-Level",
      },
      productionScore: 60,
      architectureScore: 70,
      testScore: 20,
      devopsScore: 40,
      resilienceScore: 50,
      isUpstreamDerivative: false,
      auditMode: "contract",
    });

    expect(brief.employerSummary).toMatch(/Founders should treat/);
    expect(brief.developerSummary).toMatch(/data client/);
    expect(brief.recommendedRoleBand).toBe("Supervised Feature Builder");
  });

  it("keeps a valid Gemini hiring verdict when preferModelRoleBand is true", () => {
    const brief = finalizeExecutiveBrief({
      draft: {
        employerSummary:
          "Strong JD narrative fit for Frontend; codebase proof is mid-tier.",
        developerSummary: "Tighten test density on the checkout route.",
        recommendedRoleBand: "Verified Sprint Builder",
      },
      productionScore: 88,
      architectureScore: 90,
      testScore: 85,
      devopsScore: 80,
      resilienceScore: 88,
      isUpstreamDerivative: false,
      auditMode: "contract",
      preferModelRoleBand: true,
    });

    // Metric tier would be Elite (88), but overall fit verdict stays model-chosen.
    expect(brief.recommendedRoleBand).toBe("Verified Sprint Builder");
    expect(brief.employerSummary).toMatch(/JD narrative fit/);
  });

  it("falls back to metric tier when preferModelRoleBand is true but band is invalid", () => {
    const brief = finalizeExecutiveBrief({
      draft: {
        employerSummary: "Fit is unclear.",
        developerSummary: "Add CI gates.",
        recommendedRoleBand: "Mid-Level",
      },
      productionScore: 88,
      architectureScore: 90,
      testScore: 85,
      devopsScore: 80,
      resilienceScore: 88,
      isUpstreamDerivative: false,
      auditMode: "contract",
      preferModelRoleBand: true,
    });

    expect(brief.recommendedRoleBand).toBe("Elite Sprint Contractor");
  });

  it("fills empty summaries and syncs 80+ to Elite Sprint Contractor", () => {
    expect(parseExecutiveBrief(null)).toBeNull();
    const brief = finalizeExecutiveBrief({
      draft: null,
      productionScore: 88,
      architectureScore: 80,
      testScore: 70,
      devopsScore: 85,
      resilienceScore: 90,
      isUpstreamDerivative: true,
      auditMode: "contract",
    });
    expect(brief.recommendedRoleBand).toBe("Elite Sprint Contractor");
    expect(brief.employerSummary).toMatch(/88\/100/);
    expect(brief.employerSummary).toMatch(/30-point/);
    expect(brief.developerSummary.length).toBeGreaterThan(40);
  });
});
