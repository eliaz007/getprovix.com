import { describe, expect, it } from "vitest";
import { isTypescriptOrNextRepo, rankOnboardingRepos } from "@/lib/onboarding-repos";

describe("onboarding repo ranking", () => {
  it("prefers TypeScript and Next.js repositories", () => {
    const ranked = rankOnboardingRepos([
      {
        fullName: "acme/rails-app",
        language: "Ruby",
        private: false,
        description: null,
        htmlUrl: "https://github.com/acme/rails-app",
      },
      {
        fullName: "acme/next-dashboard",
        language: "TypeScript",
        private: true,
        description: "Next.js App Router",
        htmlUrl: "https://github.com/acme/next-dashboard",
      },
    ]);
    expect(ranked[0]?.fullName).toBe("acme/next-dashboard");
    expect(isTypescriptOrNextRepo(ranked[0]!)).toBe(true);
  });
});
