import type { FirewallReport } from "@/lib/firewall-contract";
import { toGitHubOwnerRepo } from "@/lib/github-repo-ref";

const STORAGE_KEY = "provix.firewall.scan";
const AUDIT_COMPLETE_KEY = "provix.onboarding.audit-complete";

export type OnboardingAuditCompletion = {
  repo: string;
  completedAt: string;
};

export type FirewallScanHandoff = {
  repoUrl: string;
  report: FirewallReport;
  note: string;
  source?: "local" | "github";
};

export function saveFirewallScanHandoff(handoff: FirewallScanHandoff) {
  writeStorageItem(STORAGE_KEY, JSON.stringify(handoff));
}

export function readLatestFirewallScanHandoff(): FirewallScanHandoff | null {
  try {
    const raw = readStorageItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<FirewallScanHandoff>;
    if (typeof parsed.repoUrl !== "string" || !parsed.report || typeof parsed.note !== "string") {
      return null;
    }
    return {
      repoUrl: parsed.repoUrl,
      report: parsed.report,
      note: parsed.note,
      source: parsed.source === "github" || parsed.source === "local" ? parsed.source : undefined,
    };
  } catch {
    return null;
  }
}

function sameRepository(left: string, right: string): boolean {
  const normalizedLeft = toGitHubOwnerRepo(left) ?? left.trim();
  const normalizedRight = toGitHubOwnerRepo(right) ?? right.trim();
  return normalizedLeft === normalizedRight;
}

function readStorageItem(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return sessionStorage.getItem(key) ?? localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorageItem(key: string, value: string) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // Private mode can block sessionStorage; localStorage is the fallback.
  }
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignore quota and private-mode failures.
  }
}

/** Remember that the initial AST audit finished so onboarding does not restart. */
export function markOnboardingAuditComplete(repo: string) {
  const slug = toGitHubOwnerRepo(repo) ?? repo.trim();
  if (!slug) return;
  writeStorageItem(
    AUDIT_COMPLETE_KEY,
    JSON.stringify({ repo: slug, completedAt: new Date().toISOString() } satisfies OnboardingAuditCompletion)
  );
}

export function readOnboardingAuditComplete(): OnboardingAuditCompletion | null {
  const raw = readStorageItem(AUDIT_COMPLETE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<OnboardingAuditCompletion>;
    const repo = typeof parsed.repo === "string" ? toGitHubOwnerRepo(parsed.repo) : null;
    if (!repo) return null;
    return {
      repo,
      completedAt: typeof parsed.completedAt === "string" ? parsed.completedAt : "",
    };
  } catch {
    return null;
  }
}

export function readFirewallScanHandoff(repoUrl: string): FirewallScanHandoff | null {
  const handoff = readLatestFirewallScanHandoff();
  if (!handoff || !sameRepository(handoff.repoUrl, repoUrl)) return null;
  return handoff;
}
