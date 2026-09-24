import { describe, expect, it } from "vitest";
import {
  hasUsableGitHubAuditTarget,
  isGitHubUsernameOnlyInput,
  normalizeGitHubAuditTarget,
  normalizeGitHubRepoSlug,
  parseGitHubRepoPath,
} from "./validate-github-url";

describe("strict GitHub repo slug validation", () => {
  it("normalizes protocol, host, and trailing slashes", () => {
    expect(normalizeGitHubRepoSlug("https://github.com/dad/")).toBe("dad");
    expect(normalizeGitHubRepoSlug("http://github.com/owner/repo")).toBe(
      "owner/repo"
    );
    expect(normalizeGitHubRepoSlug("github.com/owner/repo/")).toBe("owner/repo");
    expect(normalizeGitHubRepoSlug("dad")).toBe("dad");
  });

  it("requires exactly owner/repo for audit targets", () => {
    expect(parseGitHubRepoPath("https://github.com/owner/repo")).toEqual({
      owner: "owner",
      repo: "repo",
    });
    expect(parseGitHubRepoPath("owner/repo")).toEqual({
      owner: "owner",
      repo: "repo",
    });
    expect(parseGitHubRepoPath("github.com/dad")).toBeNull();
    expect(parseGitHubRepoPath("dad")).toBeNull();
    expect(hasUsableGitHubAuditTarget("github.com/dad")).toBe(false);
    expect(hasUsableGitHubAuditTarget("https://github.com/owner/repo")).toBe(
      true
    );
    expect(normalizeGitHubAuditTarget("github.com/owner/repo/")).toBe(
      "https://github.com/owner/repo"
    );
  });

  it("detects username-only profile slugs", () => {
    expect(isGitHubUsernameOnlyInput("github.com/dad")).toBe(true);
    expect(isGitHubUsernameOnlyInput("dad")).toBe(true);
    expect(isGitHubUsernameOnlyInput("owner/repo")).toBe(false);
  });
});
