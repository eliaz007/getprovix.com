/**
 * Human-facing product wording. Keep URL/view keys stable; change labels here.
 */

export const WORKSPACE_NAV = [
  {
    key: "health" as const,
    label: "Overview",
    hint: "Score and recent activity for this repo",
  },
  {
    key: "audits" as const,
    label: "Audits",
    hint: "Pick a repository and run a security audit",
  },
  {
    key: "violations" as const,
    label: "Structure",
    hint: "Architecture issues Provix can fix with a PR",
  },
  {
    key: "leaks" as const,
    label: "Security",
    hint: "Secrets, client DB exposure, and risky dependencies",
  },
] as const;

export const HISTORY_NAV_LABEL = "Activity";
export const OPEN_FIX_LABEL = "Fix with PR";
export const OPEN_FIX_LOADING_LABEL = "Opening PR…";

export const HAPPY_PATH_STEPS = [
  {
    step: 1,
    title: "Connect GitHub",
    detail: "Sign in so Provix can install its GitHub App on your account.",
  },
  {
    step: 2,
    title: "Pick a repo",
    detail: "Choose a TypeScript or Next.js repository to scan.",
  },
  {
    step: 3,
    title: "Fix with one click",
    detail: "Open a pull request for each finding Provix can safely repair.",
  },
] as const;
