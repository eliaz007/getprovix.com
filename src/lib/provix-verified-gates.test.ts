import { describe, expect, it } from "vitest";
import {
  isHistoryGateMet,
  meetsProvixVerifiedGates,
  qualifiesHiringTrack,
} from "@/lib/audit-readiness";
import { canPublishProductionScore } from "@/lib/production-audit";

describe("shared Provix Verified gates", () => {
  it("requires Code Health ≥ 75 and History ≥ 80 with a successful fetch", () => {
    expect(
      meetsProvixVerifiedGates({
        codeHealthScore: 80,
        deliveryHygieneScore: 85,
        historyAvailable: true,
      })
    ).toBe(true);
    expect(
      meetsProvixVerifiedGates({
        codeHealthScore: 74,
        deliveryHygieneScore: 100,
        historyAvailable: true,
      })
    ).toBe(false);
    expect(
      meetsProvixVerifiedGates({
        codeHealthScore: 90,
        deliveryHygieneScore: 79,
        historyAvailable: true,
      })
    ).toBe(false);
  });

  it("fails History when the commit fetch is unavailable", () => {
    expect(
      isHistoryGateMet({
        deliveryHygieneScore: 100,
        historyAvailable: false,
      })
    ).toBe(false);
    expect(
      meetsProvixVerifiedGates({
        codeHealthScore: 95,
        deliveryHygieneScore: 100,
        historyAvailable: false,
      })
    ).toBe(false);
    expect(
      canPublishProductionScore(95, 100, false)
    ).toBe(false);
  });

  it("keeps onboarding track qualification aligned with publish/Verified", () => {
    expect(qualifiesHiringTrack(80, 90, true)).toBe(true);
    expect(qualifiesHiringTrack(80, 40, true)).toBe(false);
    expect(qualifiesHiringTrack(80, 100, false)).toBe(false);
    expect(canPublishProductionScore(80, 90, true)).toBe(true);
    expect(canPublishProductionScore(80, 40, true)).toBe(false);
  });
});
