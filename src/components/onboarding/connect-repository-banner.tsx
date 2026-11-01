"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import ConnectRepositoryButton from "@/components/onboarding/connect-repository-button";
import { useGithubAppInstallation } from "@/components/onboarding/use-github-app-installation";
import { useDashboardNav } from "@/components/dashboard/dashboard-nav-context";
import { useFirewallView } from "@/components/firewall/firewall-view-context";

const DISMISS_KEY_PREFIX = "provix_connect_repo_banner_dismissed";
const SETTINGS_PATH = "/dashboard/settings";

function dismissStorageKey(userId: string | null): string {
  return userId ? `${DISMISS_KEY_PREFIX}:${userId}` : DISMISS_KEY_PREFIX;
}

export default function ConnectRepositoryBanner() {
  const router = useRouter();
  const { userId } = useDashboardNav();
  const { repoSlug } = useFirewallView();
  const installation = useGithubAppInstallation();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      // localStorage survives Google sign-out/sign-in; sessionStorage did not.
      setDismissed(localStorage.getItem(dismissStorageKey(userId)) === "1");
    } catch {
      setDismissed(false);
    }
  }, [userId]);

  function dismissAndOpenSettings() {
    try {
      localStorage.setItem(dismissStorageKey(userId), "1");
    } catch {
      // private mode — still hide for this mount
    }
    setDismissed(true);
    router.push(SETTINGS_PATH);
  }

  // Hide while auth/install status is unresolved — never nag on a failed fetch.
  if (installation.loading) return null;
  // Already using a repo in the firewall workspace.
  if (repoSlug) return null;
  // GitHub App is connected.
  if (installation.installed) return null;
  // User dismissed (persists across Google sign-in).
  if (dismissed) return null;
  // Ambiguous / unauthenticated install lookup — don't flash the banner.
  if (!installation.authenticated) return null;

  return (
    <section className="relative mb-3 border border-zinc-800 bg-zinc-950 px-3 py-2.5 pr-11 sm:px-4">
      <button
        type="button"
        onClick={dismissAndOpenSettings}
        aria-label="Dismiss connect banner and open account settings"
        className="absolute top-2.5 right-2.5 inline-flex h-7 w-7 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-900 hover:text-zinc-200"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0 max-w-2xl">
          <p className="font-mono text-sm text-zinc-100">
            Install the Provix GitHub App to enable automated security monitoring and RLS boundary audits.
          </p>
          <p className="mt-1 font-mono text-[11px] text-zinc-500">
            You can manage GitHub App integration anytime in{" "}
            <Link href={SETTINGS_PATH} className="text-zinc-300 underline-offset-2 hover:text-zinc-100 hover:underline">
              account settings
            </Link>
            .
          </p>
        </div>
        <ConnectRepositoryButton />
      </div>
    </section>
  );
}
