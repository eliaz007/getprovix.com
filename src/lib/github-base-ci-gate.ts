import type { Octokit } from "@octokit/rest";

/** Checks / statuses that mean "this repo's default branch is not merge-safe." */
const CI_NAME =
  /typecheck|lint|tsc|ci\b|build|test|unit|integration|check|vercel|deploy/i;

export type GithubCheckLike = {
  name: string;
  status: string;
  conclusion: string | null;
};

export type GithubStatusLike = {
  context: string;
  state: string;
};

/**
 * If the base branch already fails CI/typecheck, every Open Fix PR will fail for
 * the same reason (Provix gate green, GitHub CI red). Refuse before opening.
 */
export function baseBranchCiBlockMessage(
  checks: readonly GithubCheckLike[],
  statuses: readonly GithubStatusLike[],
  baseBranch: string
): string | null {
  const failedChecks = checks.filter((check) => {
    if (!CI_NAME.test(check.name)) return false;
    if (check.status !== "completed") return false;
    const conclusion = (check.conclusion ?? "").toLowerCase();
    return conclusion === "failure" || conclusion === "timed_out" || conclusion === "action_required";
  });

  const failedStatuses = statuses.filter((status) => {
    if (!CI_NAME.test(status.context)) return false;
    return status.state === "failure" || status.state === "error";
  });

  if (failedChecks.length === 0 && failedStatuses.length === 0) return null;

  const names = [
    ...failedChecks.map((check) => check.name),
    ...failedStatuses.map((status) => status.context),
  ]
    .filter(Boolean)
    .slice(0, 4);

  const label = names.length > 0 ? names.join(", ") : "CI";
  return `Open Fix refused: \`${baseBranch}\` already fails CI (${label}). Fix the base branch first — otherwise every autofix PR fails for the same reason, even when Provix's own gate is green.`;
}

/**
 * Read Checks + commit statuses for the default-branch tip.
 * Missing permissions → allow Open Fix (do not brick the product).
 */
export async function assertBaseBranchReadyForAutofix(
  octokit: Octokit,
  owner: string,
  repo: string,
  baseBranch: string,
  tipSha: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  let checks: GithubCheckLike[] = [];
  let statuses: GithubStatusLike[] = [];

  try {
    const listed = await octokit.rest.checks.listForRef({
      owner,
      repo,
      ref: tipSha,
      per_page: 100,
    });
    checks = listed.data.check_runs.map((run) => ({
      name: run.name,
      status: run.status,
      conclusion: run.conclusion,
    }));
  } catch (error) {
    const status =
      error && typeof error === "object" && "status" in error && typeof error.status === "number"
        ? error.status
        : null;
    if (status === 403 || status === 404) {
      console.warn(
        `[autofix/pr] could not read check runs for ${owner}/${repo}@${baseBranch}; skipping base CI gate`
      );
    } else {
      console.warn(
        `[autofix/pr] check runs lookup failed for ${owner}/${repo}@${baseBranch}`,
        error instanceof Error ? error.message : error
      );
    }
  }

  try {
    const combined = await octokit.rest.repos.getCombinedStatusForRef({
      owner,
      repo,
      ref: tipSha,
    });
    statuses = combined.data.statuses.map((row) => ({
      context: row.context,
      state: row.state,
    }));
  } catch (error) {
    const status =
      error && typeof error === "object" && "status" in error && typeof error.status === "number"
        ? error.status
        : null;
    if (status !== 403 && status !== 404) {
      console.warn(
        `[autofix/pr] commit status lookup failed for ${owner}/${repo}@${baseBranch}`,
        error instanceof Error ? error.message : error
      );
    }
  }

  const message = baseBranchCiBlockMessage(checks, statuses, baseBranch);
  if (message) return { ok: false, message };
  return { ok: true };
}
