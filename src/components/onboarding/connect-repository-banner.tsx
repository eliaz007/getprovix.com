"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import ConnectRepositoryButton from "@/components/onboarding/connect-repository-button";
import { useGithubAppInstallation } from "@/components/onboarding/use-github-app-installation";

const DISMISS_KEY = "provix_connect_repo_banner_dismissed";
const SETTINGS_PATH = "/dashboard/settings";

export default function ConnectRepositoryBanner() {
  const router = useRouter();
  const installation = useGithubAppInstallation();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      setDismissed(sessionStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  function dismissAndOpenSettings() {
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // sessionStorage can fail in private mode; still hide for this mount.
    }
    setDismissed(true);
    router.push(SETTINGS_PATH);
  }

  // Hide while resolving, once installed, or after a session dismiss.
  if (installation.loading || installation.installed || dismissed) return null;

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
