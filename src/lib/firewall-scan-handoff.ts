import type { FirewallReport } from "@/lib/firewall-contract";
import { toGitHubOwnerRepo } from "@/lib/github-repo-ref";

const STORAGE_KEY = "provix.firewall.scan";

export type FirewallScanHandoff = {
  repoUrl: string;
  report: FirewallReport;
  note: string;
  source?: "local" | "github";
};

export function saveFirewallScanHandoff(handoff: FirewallScanHandoff) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(handoff));
}

export function readLatestFirewallScanHandoff(): FirewallScanHandoff | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
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

export function readFirewallScanHandoff(repoUrl: string): FirewallScanHandoff | null {
  const handoff = readLatestFirewallScanHandoff();
  if (!handoff || !sameRepository(handoff.repoUrl, repoUrl)) return null;
  return handoff;
}
