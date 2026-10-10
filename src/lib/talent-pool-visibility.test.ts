import { describe, expect, it } from "vitest";
import {
  canEnableTalentPoolVisibility,
  formatMarketplacePublishSaveBlockedMessage,
  hasQualifyingTalentPoolAudit,
  isTalentPoolGitHubLinked,
  isTalentPoolOwnershipVerified,
  listMarketplacePublishGateFailures,
  MARKETPLACE_PUBLISH_GATE_MESSAGES,
  meetsMarketplacePublishCriteria,
  resolveTalentPoolAuditedRepoUrl,
  talentPoolVisibilityFailureMessage,
  TALENT_POOL_CONNECT_GITHUB_MESSAGE,
  TALENT_POOL_OWNERSHIP_REQUIRED_MESSAGE,
} from "./talent-pool-visibility";

describe("talent pool visibility gating", () => {
  it("requires a 75+ audit", () => {
    expect(hasQualifyingTalentPoolAudit(74, null)).toBe(false);
    expect(hasQualifyingTalentPoolAudit(undefined, 75)).toBe(true);
  });

  it("requires GitHub, verified ownership, and a qualifying audit", () => {
    expect(
      canEnableTalentPoolVisibility({
        githubVerified: true,
        ownershipVerified: true,
        scores: [88],
      })
    ).toBe(true);
    expect(
      canEnableTalentPoolVisibility({
        githubVerified: false,
        ownershipVerified: true,
        scores: [99],
      })
    ).toBe(false);
    expect(
      canEnableTalentPoolVisibility({
        githubVerified: true,
        ownershipVerified: false,
        scores: [99],
      })
    ).toBe(false);
    expect(
      canEnableTalentPoolVisibility({
        githubVerified: true,
        ownershipVerified: true,
        scores: [60],
      })
    ).toBe(false);
  });
});

describe("talent pool GitHub / ownership helpers", () => {
  it("treats linked GitHub the same as the settings Linked badge", () => {
    expect(
      isTalentPoolGitHubLinked({
        githubVerified: true,
        githubUsername: "eliaz007",
      })
    ).toBe(true);
    expect(
      isTalentPoolGitHubLinked({
        githubVerified: true,
        githubUsername: "",
      })
    ).toBe(false);
  });

  it("matches Ownership verified badge via status or audited repo namespace", () => {
    expect(
      isTalentPoolOwnershipVerified({
        verificationStatus: "verified",
        githubUsername: "eliaz007",
      })
    ).toBe(true);
    expect(
      isTalentPoolOwnershipVerified({
        verificationStatus: "Verified",
        githubUsername: "eliaz007",
      })
    ).toBe(true);
    expect(
      isTalentPoolOwnershipVerified({
        isAuditVerified: true,
        githubUsername: "eliaz007",
      })
    ).toBe(true);
    expect(
      isTalentPoolOwnershipVerified({
        verificationStatus: "unverified",
        auditedRepoUrl: "https://github.com/eliaz007/getprovix.com",
        githubUsername: "eliaz007",
      })
    ).toBe(true);
    expect(
      isTalentPoolOwnershipVerified({
        verificationStatus: "unverified",
        auditBreakdown: {
          audited_repo_url: "eliaz007/getprovix.com",
        },
        githubUsername: "@eliaz007",
      })
    ).toBe(true);
    expect(
      isTalentPoolOwnershipVerified({
        verificationStatus: "unverified",
        portfolioUrl: "https://github.com/eliaz007/getprovix.com",
        githubUsername: "eliaz007",
      })
    ).toBe(true);
    expect(
      isTalentPoolOwnershipVerified({
        verificationStatus: "unverified",
        auditedRepoUrl: "https://github.com/other/my-app",
        githubUsername: "eliaz007",
      })
    ).toBe(false);
  });

  it("ignores empty audited_repo_url placeholders when resolving repo evidence", () => {
    expect(
      resolveTalentPoolAuditedRepoUrl({
        auditedRepoUrl: "",
        auditBreakdown: { audited_repo_url: "eliaz007/getprovix.com" },
      })
    ).toBe("eliaz007/getprovix.com");
    expect(
      resolveTalentPoolAuditedRepoUrl({
        auditedRepoUrl: "",
        historyRepoUrl: "Private repository",
        portfolioUrl: "https://github.com/eliaz007/getprovix.com",
      })
    ).toBe("https://github.com/eliaz007/getprovix.com");
  });

  it("returns Connect GitHub only when the GitHub link gate fails", () => {
    expect(
      talentPoolVisibilityFailureMessage({
        githubVerified: false,
        ownershipVerified: true,
        scores: [90],
      })
    ).toBe(TALENT_POOL_CONNECT_GITHUB_MESSAGE);
    expect(
      talentPoolVisibilityFailureMessage({
        githubVerified: true,
        ownershipVerified: false,
        scores: [90],
      })
    ).toBe(TALENT_POOL_OWNERSHIP_REQUIRED_MESSAGE);
  });
});

describe("marketplace publish criteria", () => {
  const ready = {
    isVisibleInPool: true,
    githubVerified: true,
    ownershipVerified: true,
    scores: [88] as Array<number | null | undefined>,
  };

  it("passes only when every publishing gate is met", () => {
    expect(meetsMarketplacePublishCriteria(ready)).toBe(true);
    expect(listMarketplacePublishGateFailures(ready)).toEqual([]);
  });

  it("lists each missing publishing criterion", () => {
    expect(
      listMarketplacePublishGateFailures({
        isVisibleInPool: false,
        githubVerified: false,
        ownershipVerified: false,
        scores: [40],
      })
    ).toEqual([
      MARKETPLACE_PUBLISH_GATE_MESSAGES.github_verified,
      MARKETPLACE_PUBLISH_GATE_MESSAGES.ownership_verified,
      MARKETPLACE_PUBLISH_GATE_MESSAGES.score,
      MARKETPLACE_PUBLISH_GATE_MESSAGES.visible_in_pool,
    ]);
  });

  it("formats a save-blocked message from failures", () => {
    expect(
      formatMarketplacePublishSaveBlockedMessage([
        MARKETPLACE_PUBLISH_GATE_MESSAGES.score,
        MARKETPLACE_PUBLISH_GATE_MESSAGES.github_verified,
      ])
    ).toBe(
      "Cannot open full-time or contract availability until: Score must be >= 75; GitHub must be verified."
    );
  });
});
