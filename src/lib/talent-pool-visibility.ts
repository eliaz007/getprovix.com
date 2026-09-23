export const TALENT_POOL_CONNECT_GITHUB_MESSAGE =
  "Connect GitHub to unlock talent pool visibility";

export const TALENT_POOL_SCORE_REQUIRED_MESSAGE =
  "A 75+ production audit is required to become visible to employers.";

/** Matches `PUBLIC_SCORECARD_THRESHOLD` without importing the audit module. */
const TALENT_POOL_SCORE_THRESHOLD = 75;

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
  scores: Array<number | null | undefined>;
}): boolean {
  return (
    input.githubVerified === true &&
    hasQualifyingTalentPoolAudit(...input.scores)
  );
}
