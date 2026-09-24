import { describe, expect, it } from "vitest";
import {
  isInaccessiblePublicAudit,
  isInvalidRepoFormatResponse,
  isPrivateOrNotFoundAuditResponse,
  isUnverifiedOwnershipResponse,
  unverifiedOwnershipOwner,
} from "./inaccessible-public-audit";

describe("audit access error classification", () => {
  it("treats REPO_NOT_FOUND_OR_PRIVATE as the existing private banner case", () => {
    const result = {
      error: "REPO_NOT_FOUND_OR_PRIVATE",
      message: "This repository is private or does not exist.",
      inaccessibleRepo: true,
      isPrivateOrNotFound: true,
    };

    expect(isPrivateOrNotFoundAuditResponse(result)).toBe(true);
    expect(isUnverifiedOwnershipResponse(result)).toBe(false);
    expect(isInaccessiblePublicAudit({ status: 404, result })).toBe(true);
  });

  it("does not treat UNVERIFIED_OWNERSHIP as a private/missing repo", () => {
    const result = {
      error: "UNVERIFIED_OWNERSHIP",
      owner: "calcom",
      message: "Repository is not owned by your connected GitHub account.",
    };

    expect(isUnverifiedOwnershipResponse(result)).toBe(true);
    expect(unverifiedOwnershipOwner(result)).toBe("calcom");
    expect(isPrivateOrNotFoundAuditResponse(result)).toBe(false);
    expect(isInaccessiblePublicAudit({ status: 403, result })).toBe(false);
  });

  it("does not treat INVALID_REPO_FORMAT as a private/missing repo", () => {
    const result = {
      error: "INVALID_REPO_FORMAT",
      message:
        "INVALID_REPO_FORMAT: Please provide a full repository path (e.g., username/repository-name).",
    };

    expect(isInvalidRepoFormatResponse(result)).toBe(true);
    expect(isPrivateOrNotFoundAuditResponse(result)).toBe(false);
    expect(isInaccessiblePublicAudit({ status: 400, result })).toBe(false);
  });
});
