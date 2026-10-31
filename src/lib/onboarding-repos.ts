import type { GithubInstallationRepo } from "@/lib/github-app-client";

const TS_LANG = /^(typescript|javascript|tsx|jsx)$/i;
const NEXT_HINT =
  /\bnext(?:\.?js)?\b|app router|pages\/|src\/app\b|create-next-app/i;

/** Prefer TypeScript / JavaScript / Next.js repositories for the first AST audit. */
export function isTypescriptOrNextRepo(repo: GithubInstallationRepo): boolean {
  if (repo.language && TS_LANG.test(repo.language)) return true;
  const haystack = `${repo.fullName} ${repo.description ?? ""}`;
  return NEXT_HINT.test(haystack);
}

export function rankOnboardingRepos(repos: readonly GithubInstallationRepo[]): GithubInstallationRepo[] {
  const preferred = repos.filter(isTypescriptOrNextRepo);
  const rest = repos.filter((repo) => !isTypescriptOrNextRepo(repo));
  return [...preferred, ...rest];
}

export type OnboardingRepositoriesResponse = {
  authenticated: boolean;
  installed: boolean;
  repositories: GithubInstallationRepo[];
  preferred: GithubInstallationRepo[];
  primaryRepo: string | null;
  message?: string;
};
