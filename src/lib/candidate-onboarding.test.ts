import { describe, expect, it } from "vitest";
import {
  buildAuditorSetupPath,
  getFeaturedRepoValidationMessage,
  hasCompletedCandidateSetup,
  hasFeaturedGitHubRepository,
  parseSkillsInput,
} from "@/lib/candidate-onboarding";

describe("candidate onboarding setup gate", () => {
  it("requires a featured owner/repo URL before dashboard access", () => {
    expect(hasCompletedCandidateSetup(null)).toBe(false);
    expect(
      hasCompletedCandidateSetup({
        full_name: "Ada Lovelace",
        job_title: "Engineer",
        bio: "Builds proof-backed products.",
        skills: ["TypeScript"],
        experience_level: "Mid-Level",
        portfolio_url: "https://github.com/ada/engine",
      })
    ).toBe(true);
    expect(
      hasCompletedCandidateSetup({
        full_name: "Ada Lovelace",
        job_title: "Engineer",
        bio: "Builds proof-backed products.",
        skills: ["TypeScript"],
        experience_level: "Mid-Level",
        portfolio_url: "https://github.com/ada",
      })
    ).toBe(false);
    expect(hasFeaturedGitHubRepository("https://github.com/ada/engine")).toBe(
      true
    );
    expect(hasFeaturedGitHubRepository("https://github.com/ada")).toBe(false);
    expect(getFeaturedRepoValidationMessage("https://github.com/ada")).toMatch(
      /full repository/i
    );
  });

  it("parses comma-separated skills", () => {
    expect(parseSkillsInput(" TypeScript, Next.js , ,PostgreSQL ")).toEqual([
      "TypeScript",
      "Next.js",
      "PostgreSQL",
    ]);
  });

  it("builds the post-setup auditor redirect with featured repo", () => {
    expect(buildAuditorSetupPath("https://github.com/ada/engine")).toBe(
      "/dashboard/auditor?github=https%3A%2F%2Fgithub.com%2Fada%2Fengine"
    );
    expect(buildAuditorSetupPath("")).toBe("/dashboard/auditor");
  });
});
