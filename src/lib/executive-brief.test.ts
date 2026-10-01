import { describe, expect, it } from "vitest";
import {
  assignRecommendedRoleBand,
  finalizeExecutiveBrief,
  parseExecutiveBrief,
} from "./executive-brief";

describe("assignRecommendedRoleBand", () => {
  it("requires 75 plus robust tests and resilience for Mid-Level", () => {
    expect(
      assignRecommendedRoleBand({
        productionScore: 75,
        testing: 65,
        resilience: 80,
      })
    ).toBe("Mid-Level");
    expect(
      assignRecommendedRoleBand({
        productionScore: 90,
        testing: 64,
        resilience: 90,
      })
    ).toBe("Early-Stage Generalist");
  });

  it("keeps a 75+ repo with a weak pillar at Early-Stage Generalist", () => {
    expect(
      assignRecommendedRoleBand({
        productionScore: 82,
        testing: 70,
        resilience: 65,
      })
    ).toBe("Early-Stage Generalist");
  });

  it("uses Intern / Junior below 75 when one pillar is robust", () => {
    expect(
      assignRecommendedRoleBand({
        productionScore: 74,
        testing: 70,
        resilience: 40,
      })
    ).toBe("Intern / Junior");
  });

  it("uses Needs Hardening when the score and both pillars are weak", () => {
    expect(
      assignRecommendedRoleBand({
        productionScore: 40,
        testing: 10,
        resilience: 50,
      })
    ).toBe("Needs Hardening");
  });
});

describe("finalizeExecutiveBrief", () => {
  it("keeps model sentences and overwrites the role band from the scores", () => {
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
    });

    expect(brief.employerSummary).toMatch(/Founders should treat/);
    expect(brief.developerSummary).toMatch(/data client/);
    expect(brief.recommendedRoleBand).toBe("Needs Hardening");
  });

  it("fills empty summaries and ignores a missing draft", () => {
    expect(parseExecutiveBrief(null)).toBeNull();
    const brief = finalizeExecutiveBrief({
      draft: null,
      productionScore: 88,
      architectureScore: 80,
      testScore: 70,
      devopsScore: 85,
      resilienceScore: 90,
      isUpstreamDerivative: true,
    });
    expect(brief.recommendedRoleBand).toBe("Mid-Level");
    expect(brief.employerSummary).toMatch(/88\/100/);
    expect(brief.employerSummary).toMatch(/30-point/);
    expect(brief.developerSummary.length).toBeGreaterThan(40);
  });
});
