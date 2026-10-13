import { describe, expect, it } from "vitest";
import {
  formatContractAvailabilityRemediation,
  formatFullTimeAvailabilityRemediation,
  formatMarketplaceAvailabilityLockedAlert,
  getPreferenceAvailabilityPresentation,
  isMarketplaceAvailabilityQualified,
  normalizeContractHourlyRate,
} from "./contract-availability";

describe("normalizeContractHourlyRate", () => {
  it("coerces currency and unit suffixes to whole-dollar integers", () => {
    expect(normalizeContractHourlyRate(85)).toBe(85);
    expect(normalizeContractHourlyRate("85")).toBe(85);
    expect(normalizeContractHourlyRate("$85")).toBe(85);
    expect(normalizeContractHourlyRate("$1,200")).toBe(1200);
    expect(normalizeContractHourlyRate("85/hr")).toBe(85);
    expect(normalizeContractHourlyRate("85.6")).toBe(86);
    expect(normalizeContractHourlyRate("")).toBeNull();
    expect(normalizeContractHourlyRate("$")).toBeNull();
    expect(normalizeContractHourlyRate(-5)).toBeNull();
  });
});

describe("preference availability presentation", () => {
  it("maps mode-gated engagement flags onto Availability Status pills", () => {
    expect(getPreferenceAvailabilityPresentation(true, true)).toMatchObject({
      label: "● Full-Time + Contract",
      isLive: true,
      statusBadge: "Live",
    });
    expect(getPreferenceAvailabilityPresentation(false, true)).toMatchObject({
      label: "● Contract Sprints Only",
      isLive: true,
    });
    expect(getPreferenceAvailabilityPresentation(true, false)).toMatchObject({
      label: "● Full-Time Only",
      isLive: true,
    });
    expect(getPreferenceAvailabilityPresentation(false, false)).toMatchObject({
      label: "○ Verification Required (Private)",
      isLive: false,
      statusBadge: "Not live",
    });
  });
});

describe("mode-specific marketplace score gates", () => {
  it("qualifies each mode independently at 75+", () => {
    expect(isMarketplaceAvailabilityQualified(74)).toBe(false);
    expect(isMarketplaceAvailabilityQualified(75)).toBe(true);
    expect(isMarketplaceAvailabilityQualified(null)).toBe(false);
  });

  it("formats remediation copy with the current mode score", () => {
    expect(formatFullTimeAvailabilityRemediation(61)).toContain(
      "Current: 61/100"
    );
    expect(formatFullTimeAvailabilityRemediation(61)).toContain(
      "test suites and crash boundaries"
    );
    expect(formatContractAvailabilityRemediation(76)).toContain(
      "Current: 76/100"
    );
    expect(formatContractAvailabilityRemediation(null)).toContain(
      "Current: 0/100"
    );
  });
});

describe("marketplace locked alert", () => {
  it("includes missing criteria in the locked alert", () => {
    expect(
      formatMarketplaceAvailabilityLockedAlert(72, [
        "Score must be >= 75",
        "GitHub must be verified",
      ])
    ).toBe(
      "Score: 72/100 — Missing: Score must be >= 75; GitHub must be verified."
    );
  });
});
