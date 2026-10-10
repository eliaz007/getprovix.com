import { describe, expect, it } from "vitest";
import {
  filterTechnicalRequirements,
  isSoftOrTenureRequirement,
} from "./technical-skill-requirements";

describe("technical skill requirements", () => {
  it("flags soft buzzwords and bare tenure", () => {
    expect(isSoftOrTenureRequirement("Agile")).toBe(true);
    expect(isSoftOrTenureRequirement("Fast")).toBe(true);
    expect(isSoftOrTenureRequirement("proactive")).toBe(true);
    expect(isSoftOrTenureRequirement("3+ years")).toBe(true);
    expect(isSoftOrTenureRequirement("5 years of experience")).toBe(true);
  });

  it("keeps real technologies", () => {
    expect(isSoftOrTenureRequirement("React")).toBe(false);
    expect(isSoftOrTenureRequirement("TypeScript")).toBe(false);
    expect(isSoftOrTenureRequirement("3+ years React")).toBe(false);
  });

  it("filters soft items out of requirement lists", () => {
    expect(
      filterTechnicalRequirements([
        "React",
        "Agile",
        "TypeScript",
        "3+ years",
        "Fast",
      ])
    ).toEqual(["React", "TypeScript"]);
  });
});
