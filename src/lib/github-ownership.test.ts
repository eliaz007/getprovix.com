import { describe, expect, it } from "vitest";
import type { User } from "@supabase/supabase-js";
import { verifyGitHubRepoOwnership } from "./github-ownership";

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

  it("rejects claims without a GitHub identity", async () => {
    const result = await verifyGitHubRepoOwnership({
      user: { identities: [], user_metadata: {} } as unknown as User,
      repoUrl: "https://github.com/acme/widgets",
    });

    expect(result.verified).toBe(false);
    expect(result.method).toBeNull();
  });
});
