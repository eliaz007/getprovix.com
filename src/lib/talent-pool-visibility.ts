import { repoNamespaceMatchesGitHubUsername } from "@/lib/validate-github-url";

export const TALENT_POOL_CONNECT_GITHUB_MESSAGE =
  "Connect GitHub to unlock talent pool visibility";

export const TALENT_POOL_SCORE_REQUIRED_MESSAGE =
  "A 75+ production audit is required to become visible to employers.";

export const TALENT_POOL_OWNERSHIP_REQUIRED_MESSAGE =
  "Ownership unverified. Audit a repository you authored before becoming visible.";

/** Matches `PUBLIC_SCORECARD_THRESHOLD` without importing the audit module. */
const TALENT_POOL_SCORE_THRESHOLD = 75;

const PRIVATE_AUDITED_REPO_LABEL = "Private repository";

function coerceNonEmptyText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/**
 * Pull an audited repo URL from profile/history fields without requiring a
 * fully parseable production-audit breakdown (empty string ≠ missing).
 */
export function resolveTalentPoolAuditedRepoUrl(sources: {
  auditBreakdown?: unknown;
  auditedRepoUrl?: string | null;
  portfolioUrl?: string | null;
  historyRepoUrl?: string | null;
}): string | null {
  const direct = coerceNonEmptyText(sources.auditedRepoUrl);
  if (direct && direct !== PRIVATE_AUDITED_REPO_LABEL) {
    return direct;
  }

  if (
    sources.auditBreakdown &&
    typeof sources.auditBreakdown === "object" &&
    !Array.isArray(sources.auditBreakdown)
  ) {
    const record = sources.auditBreakdown as Record<string, unknown>;
    for (const key of [
      "audited_repo_url",
      "repo_url",
      "github_url",
      "repository",
      "repo",
    ] as const) {
      const value = coerceNonEmptyText(record[key]);
      if (value && value !== PRIVATE_AUDITED_REPO_LABEL) {
        return value;
      }
    }
  }

  const history = coerceNonEmptyText(sources.historyRepoUrl);
  if (history && history !== PRIVATE_AUDITED_REPO_LABEL) {
    return history;
  }

  const portfolio = coerceNonEmptyText(sources.portfolioUrl);
  if (portfolio && /github\.com/i.test(portfolio)) {
    return portfolio;
  }

  return null;
}

/** Same rule as the green "✓ Linked: @user" status in profile settings. */
export function isTalentPoolGitHubLinked(input: {
  githubVerified?: boolean | null;
  githubUsername?: string | null;
}): boolean {
  const username = (input.githubUsername ?? "").replace(/^@/, "").trim();
  return input.githubVerified === true && Boolean(username);
}

/**
 * Same rule as the green "Ownership verified" badge / scorecard:
 * - verification_status === "verified" (case-insensitive), or
 * - is_audit_verified === true, or
 * - audited repo owner namespace matches the linked GitHub login
 *   (e.g. eliaz007/getprovix.com ↔ @eliaz007).
 */
export function isTalentPoolOwnershipVerified(input: {
  verificationStatus?: string | null;
  isAuditVerified?: boolean | null;
  auditedRepoUrl?: string | null;
  auditBreakdown?: unknown;
  portfolioUrl?: string | null;
  historyRepoUrl?: string | null;
  githubUsername?: string | null;
}): boolean {
  const status = (input.verificationStatus ?? "").trim().toLowerCase();
  if (status === "verified" || input.isAuditVerified === true) {
    return true;
  }

  const auditedRepoUrl = resolveTalentPoolAuditedRepoUrl({
    auditedRepoUrl: input.auditedRepoUrl,
    auditBreakdown: input.auditBreakdown,
    portfolioUrl: input.portfolioUrl,
    historyRepoUrl: input.historyRepoUrl,
  });

  return repoNamespaceMatchesGitHubUsername(
    auditedRepoUrl,
    input.githubUsername
  );
}

export type MarketplacePublishGateInput = {
  isVisibleInPool: boolean;
  githubVerified: boolean;
  ownershipVerified: boolean;
  scores: Array<number | null | undefined>;
};

/** Human-readable failures for marketplace availability / Live status. */
export const MARKETPLACE_PUBLISH_GATE_MESSAGES = {
  github_verified: "GitHub must be verified",
  ownership_verified: "Repository ownership must be verified",
  score: "Score must be >= 75",
  visible_in_pool: "Visible to Employers must be on",
} as const;

export type MarketplacePublishGateKey =
  keyof typeof MARKETPLACE_PUBLISH_GATE_MESSAGES;

export function hasQualifyingTalentPoolAudit(
  ...scores: Array<number | null | undefined>
): boolean {
  return scores.some(
    (score) =>
      typeof score === "number" &&
      Number.isFinite(score) &&
      score >= TALENT_POOL_SCORE_THRESHOLD
  );
}

export function canEnableTalentPoolVisibility(input: {
  githubVerified: boolean;
  ownershipVerified: boolean;
  scores: Array<number | null | undefined>;
}): boolean {
  return (
    input.githubVerified === true &&
    input.ownershipVerified === true &&
    hasQualifyingTalentPoolAudit(...input.scores)
  );
}

export function talentPoolVisibilityFailureMessage(input: {
  githubVerified: boolean;
  ownershipVerified: boolean;
  scores: Array<number | null | undefined>;
}): string {
  if (!input.githubVerified) {
    return TALENT_POOL_CONNECT_GITHUB_MESSAGE;
  }
  if (!input.ownershipVerified) {
    return TALENT_POOL_OWNERSHIP_REQUIRED_MESSAGE;
  }
  return TALENT_POOL_SCORE_REQUIRED_MESSAGE;
}

/**
 * Publishing criteria required before Full-Time/Contract prefs or Live status
 * can appear active: pool visibility, GitHub, ownership, and 75+ score.
 */
export function listMarketplacePublishGateFailures(
  input: MarketplacePublishGateInput
): string[] {
  const failures: string[] = [];

  if (input.githubVerified !== true) {
    failures.push(MARKETPLACE_PUBLISH_GATE_MESSAGES.github_verified);
  }
  if (input.ownershipVerified !== true) {
    failures.push(MARKETPLACE_PUBLISH_GATE_MESSAGES.ownership_verified);
  }
  if (!hasQualifyingTalentPoolAudit(...input.scores)) {
    failures.push(MARKETPLACE_PUBLISH_GATE_MESSAGES.score);
  }
  if (input.isVisibleInPool !== true) {
    failures.push(MARKETPLACE_PUBLISH_GATE_MESSAGES.visible_in_pool);
  }

  return failures;
}

export function meetsMarketplacePublishCriteria(
  input: MarketplacePublishGateInput
): boolean {
  return listMarketplacePublishGateFailures(input).length === 0;
}

export function formatMarketplacePublishSaveBlockedMessage(
  failures: string[]
): string {
  if (failures.length === 0) {
    return TALENT_POOL_SCORE_REQUIRED_MESSAGE;
  }
  return `Cannot open full-time or contract availability until: ${failures.join("; ")}.`;
}
