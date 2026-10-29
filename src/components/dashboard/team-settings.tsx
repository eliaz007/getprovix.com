"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDashboardNav } from "@/components/dashboard/dashboard-nav-context";
import { signOutAndClearSession } from "@/lib/sign-out";
import { createClient } from "@/utils/supabase/client";

export default function TeamSettings() {
  const router = useRouter();
  const { authLoading, isGuest, requireAuth, userDisplayName } = useDashboardNav();
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

  return (
    <section className="mx-auto max-w-2xl text-zinc-100">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-300">Account</p>
      <h1 className="mt-2 text-4xl font-extrabold tracking-tight text-white">Team settings</h1>
      <p className="mt-3 text-sm leading-relaxed text-textMuted">
        Manage the people who can open this workspace. Architecture scans, health metrics, and
        violation logs stay in the firewall.
      </p>

      {authLoading ? (
        <p className="mt-8 text-sm text-textMuted" role="status">
          Loading workspace...
        </p>
      ) : isGuest ? (
        <div className="mt-8 rounded-2xl border border-white/10 bg-[#101218] p-6">
          <p className="text-sm text-zinc-300">Sign in to manage this workspace.</p>
          <button
            type="button"
            onClick={() => requireAuth()}
            className="mt-4 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-violet-500"
          >
            Sign in
          </button>
        </div>
      ) : (
        <div className="mt-8 space-y-4 rounded-2xl border border-white/10 bg-[#101218] p-6">
          <dl className="space-y-4">
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Name</dt>
              <dd className="mt-1 text-sm text-white">{userDisplayName}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Email</dt>
              <dd className="mt-1 text-sm text-white">{email ?? "Loading email..."}</dd>
            </div>
          </dl>
          <div className="flex flex-col gap-3 pt-2 sm:flex-row">
            <Link
              href="/firewall"
              className="rounded-xl bg-violet-600 px-4 py-2.5 text-center text-sm font-semibold text-white transition-colors hover:bg-violet-500"
            >
              Open firewall
            </Link>
            <button
              type="button"
              onClick={() => void signOut()}
              disabled={signingOut}
              className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-zinc-200 transition-colors hover:bg-white/5 disabled:opacity-60"
            >
              {signingOut ? "Signing out..." : "Sign out"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
