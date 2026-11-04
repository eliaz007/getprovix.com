import { integrityDashboardPath } from "@/lib/github-app-install";
import type { OnboardingRepositoriesResponse } from "@/lib/onboarding-repos";
import { readJsonResponse } from "@/lib/read-json-response";

/** Where a signed-in user should land: firewall after a GitHub App install, otherwise onboarding. */
export async function workspaceEntryPath(): Promise<string> {
  try {
    const response = await fetch("/api/github/repositories", { cache: "no-store" });
    const payload = await readJsonResponse<OnboardingRepositoriesResponse>(response);
    if (payload.installed) {
      return payload.primaryRepo ? integrityDashboardPath(payload.primaryRepo) : "/firewall";
    }
  } catch {
    // Stay on onboarding so a failed lookup cannot skip the connect step.
  }
  return "/onboarding";
}
