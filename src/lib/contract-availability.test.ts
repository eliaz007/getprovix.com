import { describe, expect, it } from "vitest";
import {
  formatMarketplaceAvailabilityLockedAlert,
  getPreferenceAvailabilityPresentation,
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
  it("keeps Full-Time/Contract and Live inactive without publish eligibility", () => {
    const presentation = getPreferenceAvailabilityPresentation(true, true, false);
    expect(presentation).toMatchObject({
      label: "Diagnostic Only",
      tone: "zinc",
      isLive: false,
      statusBadge: "Not live",
    });
  });

  it("shows Live only when publish-eligible and engagement is open", () => {
    expect(
      getPreferenceAvailabilityPresentation(true, true, true)
    ).toMatchObject({
      label: "Full-Time + Contract",
      isLive: true,
      statusBadge: "Live",
    });
    expect(
      getPreferenceAvailabilityPresentation(false, false, true)
    ).toMatchObject({
      label: "Diagnostic Only",
      isLive: false,
      statusBadge: "Not live",
    });
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
