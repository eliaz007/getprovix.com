import { describe, expect, it } from "vitest";
import type { User } from "@supabase/supabase-js";
import {
  githubLinkFromUser,
  githubUsernameFromUser,
  userHasGitHubIdentity,
} from "./github-identity";

function user(overrides: Record<string, unknown> = {}): User {
  return {
    id: "user-1",
    identities: [],
    user_metadata: {},
    ...overrides,
  } as unknown as User;
}

describe("githubUsernameFromUser", () => {
  it("prefers the GitHub identity login", () => {
    expect(
      githubUsernameFromUser(
        user({
          identities: [
            {
              provider: "github",
              identity_data: { user_name: "OctoCat" },
            },
          ],
        })
      )
    ).toBe("OctoCat");
  });

  it("falls back to user_metadata and strips @", () => {
    expect(
      githubUsernameFromUser(
        user({
          user_metadata: { preferred_username: "@builder" },
        })
      )
    ).toBe("builder");
  });

  it("returns null when no GitHub handle exists", () => {
    expect(githubUsernameFromUser(user())).toBeNull();
  });
});

describe("githubLinkFromUser", () => {
  it("marks GitHub OAuth users as verified and stores the handle", () => {
    expect(
      githubLinkFromUser(
        user({
          identities: [
            {
              provider: "github",
              identity_data: { user_name: "octocat" },
            },
          ],
          user_metadata: { user_name: "octocat" },
        })
      )
    ).toEqual({ github_username: "octocat", github_verified: true });
  });

  it("leaves email-only users unverified", () => {
    expect(
      githubLinkFromUser(
        user({
          app_metadata: { provider: "email", providers: ["email"] },
          user_metadata: { preferred_username: "not-github" },
        })
      )
    ).toEqual({ github_username: null, github_verified: false });
    expect(
      userHasGitHubIdentity(
        user({ app_metadata: { provider: "email", providers: ["email"] } })
      )
    ).toBe(false);
  });
});
