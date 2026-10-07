import { describe, expect, it } from "vitest";
import {
  buildAuditorSetupPath,
  getFeaturedRepoValidationMessage,
  hasCompletedCandidateSetup,
  hasFeaturedGitHubRepository,
} from "@/lib/candidate-onboarding";

describe("candidate onboarding setup gate", () => {
  it("requires a featured owner/repo URL before dashboard access", () => {
    expect(hasCompletedCandidateSetup(null)).toBe(false);
    expect(
      hasCompletedCandidateSetup({
        portfolio_url: "https://github.com/ada/engine",
      })
    ).toBe(true);
    expect(
      hasCompletedCandidateSetup({
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

  it("builds the post-setup auditor redirect with featured repo", () => {
    expect(buildAuditorSetupPath("https://github.com/ada/engine")).toBe(
      "/dashboard/auditor?github=https%3A%2F%2Fgithub.com%2Fada%2Fengine"
    );
    expect(buildAuditorSetupPath("")).toBe("/dashboard/auditor");
  });
});
