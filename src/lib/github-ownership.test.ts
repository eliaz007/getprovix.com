import { describe, expect, it } from "vitest";
import type { User } from "@supabase/supabase-js";
import {
  githubCommitMatchesLinkedUsername,
  verifyGitHubRepoOwnership,
} from "./github-ownership";

describe("verifyGitHubRepoOwnership", () => {
  it("verifies a direct owner match case-insensitively", async () => {
    const result = await verifyGitHubRepoOwnership({
      user: {
        identities: [
          {
            provider: "github",
            identity_data: { user_name: "Acme" },
          },
        ],
      } as unknown as User,
      repoUrl: "https://github.com/acme/widgets",
    });

    expect(result.verified).toBe(true);
    expect(result.method).toBe("owner");
    expect(result.username).toBe("Acme");
  });

  it("verifies an owner/repo namespace against the linked username", async () => {
    const result = await verifyGitHubRepoOwnership({
      user: {
        identities: [
          {
            provider: "github",
            identity_data: { user_name: "Acme" },
          },
        ],
      } as unknown as User,
      repoUrl: "acme/widgets",
    });

    expect(result.verified).toBe(true);
    expect(result.method).toBe("owner");
    expect(result.owner).toBe("acme");
  });

  it("rejects claims without a GitHub identity", async () => {
    const result = await verifyGitHubRepoOwnership({
      user: { identities: [], user_metadata: {} } as unknown as User,
      repoUrl: "https://github.com/acme/widgets",
    });

    expect(result.verified).toBe(false);
    expect(result.method).toBeNull();
  });
});

describe("githubCommitMatchesLinkedUsername", () => {
  it("matches commit author login", () => {
    expect(
      githubCommitMatchesLinkedUsername(
        { author: { login: "OctoCat" }, commit: { author: { email: "other@example.com" } } },
        "octocat"
      )
    ).toBe(true);
  });

  it("falls back to commit author email when login is null", () => {
    expect(
      githubCommitMatchesLinkedUsername(
        {
          author: { login: null },
          commit: { author: { email: "12345+octocat@users.noreply.github.com" } },
        },
        "octocat"
      )
    ).toBe(true);
    expect(
      githubCommitMatchesLinkedUsername(
        {
          author: null,
          commit: { author: { email: "octocat@users.noreply.github.com" } },
        },
        "OctoCat"
      )
    ).toBe(true);
  });

  it("does not use email when a different login is present", () => {
    expect(
      githubCommitMatchesLinkedUsername(
        {
          author: { login: "someone-else" },
          commit: { author: { email: "octocat@users.noreply.github.com" } },
        },
        "octocat"
      )
    ).toBe(false);
  });
});
