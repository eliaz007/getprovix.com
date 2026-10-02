import { describe, expect, it } from "vitest";
import { clampScore0to100 } from "@/lib/score-scale";
import {
  getGitHubUrlValidationMessage,
  hasUsableGitHubAuditTarget,
  isValidGitHubUrl,
  normalizeGitHubAuditTarget,
  parseGitHubRepoPath,
  parseGitHubUrl,
} from "@/lib/validate-github-url";

describe("GitHub API input validation", () => {
  it("accepts owner/repo audit targets and rejects bare handles", () => {
    expect(parseGitHubRepoPath("https://github.com/acme/widgets")).toEqual({
      owner: "acme",
      repo: "widgets",
    });
    expect(parseGitHubRepoPath("acme/widgets")).toEqual({
      owner: "acme",
      repo: "widgets",
    });
    expect(parseGitHubRepoPath("acme")).toBeNull();
    expect(hasUsableGitHubAuditTarget("https://github.com/acme/widgets")).toBe(
      true
    );
    expect(hasUsableGitHubAuditTarget("github.com/acme")).toBe(false);
  });

  it("normalizes URLs and surfaces validation messages", () => {
    expect(normalizeGitHubAuditTarget("github.com/acme/widgets/")).toBe(
      "https://github.com/acme/widgets"
    );
    expect(isValidGitHubUrl("https://github.com/acme/widgets")).toBe(true);
    expect(isValidGitHubUrl("not-a-url")).toBe(false);
    expect(getGitHubUrlValidationMessage("acme")).not.toBeNull();
    expect(
      getGitHubUrlValidationMessage("https://github.com/acme/widgets")
    ).toBeNull();
  });

  it("parses profile-only URLs separately from repo URLs", () => {
    expect(parseGitHubUrl("https://github.com/acme")).toEqual({
      owner: "acme",
      repo: null,
    });
    expect(parseGitHubUrl("https://github.com/acme/widgets")).toEqual({
      owner: "acme",
      repo: "widgets",
    });
    expect(clampScore0to100(150)).toBe(100);
    expect(clampScore0to100(-5)).toBe(0);
    expect(clampScore0to100("42")).toBe(42);
  });
});
