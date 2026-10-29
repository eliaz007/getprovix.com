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

  it("builds the post-setup firewall redirect with featured repo", () => {
    expect(buildAuditorSetupPath("https://github.com/ada/engine")).toBe(
      "/firewall?repo=ada%2Fengine"
    );
    expect(buildAuditorSetupPath("")).toBe("/firewall");
  });
});
