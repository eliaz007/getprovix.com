import { describe, expect, it } from "vitest";
import {
  canEnableTalentPoolVisibility,
  hasQualifyingTalentPoolAudit,
} from "./talent-pool-visibility";

describe("talent pool visibility gating", () => {
  it("requires a 75+ audit", () => {
    expect(hasQualifyingTalentPoolAudit(74, null)).toBe(false);
    expect(hasQualifyingTalentPoolAudit(undefined, 75)).toBe(true);
  });

  it("requires GitHub, verified ownership, and a qualifying audit", () => {
    expect(
      canEnableTalentPoolVisibility({
        githubVerified: true,
        ownershipVerified: true,
        scores: [88],
      })
    ).toBe(true);
    expect(
      canEnableTalentPoolVisibility({
        githubVerified: false,
        ownershipVerified: true,
        scores: [99],
      })
    ).toBe(false);
    expect(
      canEnableTalentPoolVisibility({
        githubVerified: true,
        ownershipVerified: false,
        scores: [99],
      })
    ).toBe(false);
    expect(
      canEnableTalentPoolVisibility({
        githubVerified: true,
        ownershipVerified: true,
        scores: [60],
      })
    ).toBe(false);
  });
});
