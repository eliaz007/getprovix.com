import { describe, expect, it } from "vitest";
import {
  detectCompensationPeriod,
  formatJobCompensation,
  formatSalaryRange,
} from "./format-salary-range";

describe("formatSalaryRange", () => {
  it("formats annual ranges with / yr", () => {
    expect(formatSalaryRange("80000-100000")).toBe(
      "$80,000 - $100,000 / yr"
    );
    expect(formatSalaryRange("80k-100k")).toBe("$80,000 - $100,000 / yr");
  });

  it("preserves hourly markers as / hr", () => {
    expect(formatSalaryRange("$200 / hr")).toBe("$200 / hr");
    expect(formatSalaryRange("$80 - $120 / hr")).toBe("$80 - $120 / hr");
    expect(formatSalaryRange("$200/hr")).toBe("$200 / hr");
  });

  it("treats bare low amounts as hourly", () => {
    expect(formatSalaryRange("$200")).toBe("$200 / hr");
    expect(formatSalaryRange("80-120")).toBe("$80 - $120 / hr");
  });
});

describe("formatJobCompensation", () => {
  it("prefers hourly_rate_range for contract cards", () => {
    expect(
      formatJobCompensation({
        salary_range: "$200",
        hourly_rate_range: "$200",
        employment_type: "contract",
      })
    ).toBe("$200 / hr");
  });

  it("does not force yearly for bare contract rates in salary_range", () => {
    expect(
      formatJobCompensation({
        salary_range: "$200",
        employment_type: "contract",
      })
    ).toBe("$200 / hr");
  });
});

describe("detectCompensationPeriod", () => {
  it("detects explicit periods", () => {
    expect(detectCompensationPeriod("$90,000 / yr", [90000])).toBe("yr");
    expect(detectCompensationPeriod("$95 / hr", [95])).toBe("hr");
  });
});
