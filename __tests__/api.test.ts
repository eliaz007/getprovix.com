import { describe, expect, it } from "vitest";
import {
  INACCESSIBLE_PUBLIC_REPO_MESSAGE,
  isInaccessiblePublicAudit,
  isInvalidRepoFormatResponse,
  isPrivateOrNotFoundAuditResponse,
  isUnverifiedOwnershipResponse,
  unverifiedOwnershipOwner,
  unverifiedOwnershipUsername,
} from "@/lib/inaccessible-public-audit";
import {
  REPO_NOT_FOUND_OR_PRIVATE,
  UNVERIFIED_OWNERSHIP,
} from "@/lib/github-ownership";
import {
  getGitHubUrlValidationMessage,
  hasUsableGitHubAuditTarget,
  INVALID_REPO_FORMAT,
  isValidGitHubUrl,
  parseGitHubRepoPath,
} from "@/lib/validate-github-url";
import {
  consumeRateLimit,
  getRequestIp,
  tooManyRequestsResponse,
} from "@/lib/ip-rate-limit";
import {
  describeDeepScreeningFailure,
  isAbortOrTimeoutError,
  isNetworkDropError,
} from "@/lib/talent-pool-candidate";
import { parseIntroRequestId } from "@/lib/admin-api-auth";

describe("API error handling and input validation", () => {
  it("validates GitHub audit URL inputs before handlers run", () => {
    expect(parseGitHubRepoPath("https://github.com/acme/widgets")).toEqual({
      owner: "acme",
      repo: "widgets",
    });
    expect(parseGitHubRepoPath("acme")).toBeNull();
    expect(hasUsableGitHubAuditTarget("https://github.com/acme/widgets")).toBe(
      true
    );
    expect(hasUsableGitHubAuditTarget("github.com/acme")).toBe(false);
    expect(isValidGitHubUrl("https://github.com/acme/widgets")).toBe(true);
    expect(getGitHubUrlValidationMessage("acme")).not.toBeNull();
    expect(
      getGitHubUrlValidationMessage("https://github.com/acme/widgets")
    ).toBeNull();
    expect(INVALID_REPO_FORMAT).toBeTruthy();
  });

  it("classifies inaccessible, ownership, and format API error payloads", () => {
    expect(
      isUnverifiedOwnershipResponse({
        error: UNVERIFIED_OWNERSHIP,
        owner: "acme",
        username: "walter",
      })
    ).toBe(true);
    expect(
      unverifiedOwnershipOwner({
        error: UNVERIFIED_OWNERSHIP,
        owner: " acme ",
      })
    ).toBe("acme");
    expect(
      unverifiedOwnershipUsername({
        error: UNVERIFIED_OWNERSHIP,
        github_username: "walter",
      })
    ).toBe("walter");

    expect(
      isInvalidRepoFormatResponse({ error: INVALID_REPO_FORMAT })
    ).toBe(true);
    expect(
      isPrivateOrNotFoundAuditResponse({
        error: REPO_NOT_FOUND_OR_PRIVATE,
        isPrivateOrNotFound: true,
        repoUrl: "https://github.com/acme/widgets",
      })
    ).toBe(true);
    expect(
      isPrivateOrNotFoundAuditResponse({ error: UNVERIFIED_OWNERSHIP })
    ).toBe(false);

    expect(
      isInaccessiblePublicAudit({
        status: 404,
        result: { error: REPO_NOT_FOUND_OR_PRIVATE },
      })
    ).toBe(true);
    expect(
      isInaccessiblePublicAudit({
        status: 403,
        result: { error: UNVERIFIED_OWNERSHIP },
      })
    ).toBe(false);
    expect(INACCESSIBLE_PUBLIC_REPO_MESSAGE).toMatch(/public GitHub/i);
  });

  it("maps transport failures and returns structured API rate-limit errors", () => {
    expect(isAbortOrTimeoutError({ name: "AbortError" })).toBe(true);
    expect(isAbortOrTimeoutError({ message: "Request timed out" })).toBe(true);
    expect(isNetworkDropError(new TypeError("Failed to fetch"))).toBe(true);
    expect(describeDeepScreeningFailure({ name: "TimeoutError" }, 504)).toMatch(
      /timed out/i
    );
    expect(describeDeepScreeningFailure(null, 503)).toMatch(/dropped/i);

    expect(parseIntroRequestId({ requestId: " intro-9 " })).toBe("intro-9");
    expect(parseIntroRequestId({ id: "legacy-id" })).toBe("legacy-id");

    const request = new Request("https://getprovix.com/api/screen", {
      headers: { "x-forwarded-for": "203.0.113.50, 10.0.0.8" },
    });
    expect(getRequestIp(request)).toBe("203.0.113.50");

    const key = `api-test:${Date.now()}`;
    expect(consumeRateLimit(key, 1, 60_000).ok).toBe(true);
    const blocked = consumeRateLimit(key, 1, 60_000);
    expect(blocked.ok).toBe(false);

    const response = tooManyRequestsResponse(blocked.retryAfterSec);
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe(
      String(blocked.retryAfterSec)
    );
  });
});
