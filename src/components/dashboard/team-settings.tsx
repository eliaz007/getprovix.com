"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDashboardNav } from "@/components/dashboard/dashboard-nav-context";
import {
  StatusPill,
  mutedLabelClass,
  panelClass,
  sectionLabelClass,
} from "@/components/firewall/firewall-ui";
import { useGithubAppInstallation } from "@/components/onboarding/use-github-app-installation";
import { signOutAndClearSession } from "@/lib/sign-out";
import { createClient } from "@/utils/supabase/client";

export default function TeamSettings() {
  const router = useRouter();
  const { authLoading, isGuest, requireAuth, userDisplayName } = useDashboardNav();
  const installation = useGithubAppInstallation();
  const [email, setEmail] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (isGuest) return;
    const supabase = createClient();
    void supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null);
    });
  }, [isGuest]);

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    await signOutAndClearSession();
    router.push("/");
    router.refresh();
  }

  const appConnected = installation.installed;
  const repoCount = installation.repositories.length;
  const automationReady = appConnected && repoCount > 0;

  return (
    <section className="mx-auto w-full max-w-4xl space-y-6 text-zinc-100">
      <header className="space-y-1">
        <p className="text-xs text-zinc-500">Workspace</p>
        <h1 className="text-2xl font-medium tracking-tight text-zinc-50">Team settings</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-zinc-500">
          Workspace identity and GitHub integration health for this Provix control plane.
        </p>
      </header>

      {authLoading ? (
        <p className={`${panelClass} px-5 py-8 text-sm text-zinc-500`} role="status">
          Loading workspace…
        </p>
      ) : isGuest ? (
        <div className={`${panelClass} px-5 py-8`}>
          <p className="text-sm text-zinc-300">Sign in to manage this workspace.</p>
          <button
            type="button"
            onClick={() => requireAuth()}
            className="mt-4 rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-950 transition-colors hover:bg-white"
          >
            Sign in
          </button>
        </div>
      ) : (
        <div className={panelClass}>
          <section className="border-b border-white/[0.06] px-5 py-5 sm:px-6">
            <h2 className={sectionLabelClass}>Workspace details</h2>
            <p className={`mt-1 ${mutedLabelClass}`}>Account tied to this Provix workspace</p>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <dt className={mutedLabelClass}>Name</dt>
                <dd className="mt-1 text-sm text-zinc-100">{userDisplayName}</dd>
              </div>
              <div>
                <dt className={mutedLabelClass}>Email</dt>
                <dd className="mt-1 text-sm text-zinc-100">{email ?? "Loading email…"}</dd>
              </div>
            </dl>
          </section>

          <section className="border-b border-white/[0.06] px-5 py-5 sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className={sectionLabelClass}>GitHub App connection</h2>
                <p className={`mt-1 ${mutedLabelClass}`}>Installation status for autonomous audits and fix PRs</p>
              </div>
              {installation.loading ? (
                <StatusPill label="Checking…" tone="neutral" />
              ) : (
                <StatusPill
                  label={appConnected ? "Connected" : "Not connected"}
                  tone={appConnected ? "ok" : "warn"}
                />
              )}
            </div>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <dt className={mutedLabelClass}>Installations</dt>
                <dd className="mt-1 text-sm tabular-nums text-zinc-100">
                  {installation.loading ? "…" : installation.installationIds.length}
                </dd>
              </div>
              <div>
                <dt className={mutedLabelClass}>Repositories in scope</dt>
                <dd className="mt-1 text-sm tabular-nums text-zinc-100">
                  {installation.loading ? "…" : repoCount}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className={mutedLabelClass}>Primary repository</dt>
                <dd className="mt-1 font-mono text-sm text-zinc-300">
                  {installation.loading
                    ? "…"
                    : installation.primaryRepo ?? "None selected yet"}
                </dd>
              </div>
            </dl>
            {!installation.loading && !appConnected ? (
              <p className="mt-3 text-sm text-zinc-500">
                Connect the Provix GitHub App from onboarding to enable repository audits and fix PRs.
              </p>
            ) : null}
          </section>

          <section className="border-b border-white/[0.06] px-5 py-5 sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className={sectionLabelClass}>Webhook &amp; automation</h2>
                <p className={`mt-1 ${mutedLabelClass}`}>PR gate, heal rounds, and autofix delivery</p>
              </div>
              {installation.loading ? (
                <StatusPill label="Checking…" tone="neutral" />
              ) : (
                <StatusPill
                  label={automationReady ? "Active" : appConnected ? "Awaiting repos" : "Inactive"}
                  tone={automationReady ? "ok" : "warn"}
                />
              )}
            </div>
            <ul className="mt-4 space-y-2 text-sm text-zinc-400">
              <li className="flex items-center justify-between gap-3 border-b border-white/[0.04] py-2 last:border-b-0">
                <span>Pull request autonomous gate</span>
                <StatusPill
                  label={automationReady ? "Ready" : "Pending"}
                  tone={automationReady ? "ok" : "neutral"}
                />
              </li>
              <li className="flex items-center justify-between gap-3 border-b border-white/[0.04] py-2 last:border-b-0">
                <span>Secret &amp; architecture heal webhooks</span>
                <StatusPill
                  label={appConnected ? "Listening" : "Offline"}
                  tone={appConnected ? "ok" : "neutral"}
                />
              </li>
              <li className="flex items-center justify-between gap-3 py-2">
                <span>One-click fix PR writes</span>
                <StatusPill
                  label={automationReady ? "Enabled" : "Disabled"}
                  tone={automationReady ? "ok" : "neutral"}
                />
              </li>
            </ul>
          </section>

          <div className="flex flex-col gap-3 px-5 py-5 sm:flex-row sm:px-6">
            <Link
              href="/firewall"
              className="rounded-lg bg-zinc-100 px-4 py-2.5 text-center text-sm font-medium text-zinc-950 transition-colors hover:bg-white"
            >
              Open firewall
            </Link>
            <button
              type="button"
              onClick={() => void signOut()}
              disabled={signingOut}
              className="rounded-lg border border-white/[0.10] px-4 py-2.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-white/[0.04] hover:text-zinc-100 disabled:opacity-60"
            >
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
