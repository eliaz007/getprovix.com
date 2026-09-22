"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Building2, Code2, Loader2 } from "lucide-react";
import {
  persistAccountRole,
  resolvePostAuthDestination,
  type AccountKind,
} from "@/lib/account-role";
import { isAdminUser } from "@/lib/admin-access";
import { createClient } from "@/utils/supabase/client";
import { ProvixLogo } from "@/components/ProvixLogo";

export default function RoleOnboardingPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [saving, setSaving] = useState<AccountKind | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    const gate = async () => {
      const { data, error: userError } = await supabase.auth.getUser();
      if (cancelled) {
        return;
      }

      if (userError || !data.user) {
        router.replace("/login");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", data.user.id)
        .maybeSingle();

      const destination = resolvePostAuthDestination({
        role: typeof profile?.role === "string" ? profile.role : null,
        isAdmin: isAdminUser(data.user),
      });

      if (destination !== "/onboarding/role") {
        router.replace(destination);
        return;
      }

      setChecking(false);
    };

    void gate();

    return () => {
      cancelled = true;
    };
  }, [router]);

  const chooseRole = async (role: AccountKind) => {
    if (saving) {
      return;
    }

    setSaving(role);
    setError(null);

    try {
      const supabase = createClient();
      const { data, error: userError } = await supabase.auth.getUser();
      if (userError || !data.user) {
        router.replace("/login");
        return;
      }

      const { error: saveError } = await persistAccountRole(
        supabase,
        data.user.id,
        role,
        data.user.email
      );

      if (saveError) {
        setError(saveError);
        setSaving(null);
        return;
      }

      window.location.assign(role === "employer" ? "/employer" : "/dashboard");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not save your account type."
      );
      setSaving(null);
    }
  };

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-brand" aria-hidden />
          <p className="text-sm text-textMuted">Checking your account...</p>
        </div>
      </div>
    );
  }

  const busy = saving !== null;

  return (
    <div className="min-h-screen bg-background px-6 py-12 text-textMuted">
      <div className="mx-auto w-full max-w-6xl">
        <div className="mb-10 flex justify-center">
          <ProvixLogo />
        </div>
        <div className="text-center">
          <p className="text-[11px] font-bold uppercase tracking-widest text-brand">
            Account setup
          </p>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-textMain sm:text-4xl">
            How will you use Provix?
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed sm:text-base">
            Choose once. This decides whether you join as a hiring team or as a
            builder.
          </p>
        </div>

        {error ? (
          <p
            role="alert"
            className="mx-auto mt-6 max-w-xl rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300"
          >
            {error}
          </p>
        ) : null}

        <section className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
          <button
            type="button"
            disabled={busy}
            onClick={() => void chooseRole("employer")}
            className="group flex h-full cursor-pointer flex-col rounded-2xl border border-white/[0.08] bg-[#131316]/85 p-8 text-left shadow-2xl backdrop-blur-xl transition-colors duration-200 hover:border-amber-500/35 disabled:cursor-wait"
          >
            <div className="mb-5 inline-flex h-11 w-11 items-center justify-center rounded-xl border border-amber-500/25 bg-[#070709] text-amber-300">
              <Building2 className="h-5 w-5" aria-hidden="true" />
            </div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-amber-300">
              For Founders
            </p>
            <h2 className="mt-3 text-2xl font-bold tracking-tight text-textMain">
              Source pre-vetted builders using static code and repository
              integrity analysis.
            </h2>
            <p className="mt-4 flex-1 text-sm leading-relaxed text-textMuted">
              Skip resume theater. Open the employer console to screen talent
              against verified GitHub artifacts and repository integrity
              signals.
            </p>
            <span className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#F4F4F6] px-4 py-3 text-sm font-semibold tracking-tight text-[#0B0B0D] shadow-sm transition-all duration-200 hover:bg-white">
              {saving === "employer" ? "Saving..." : "Enter Employer Console"}
              {saving === "employer" ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              )}
            </span>
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={() => void chooseRole("candidate")}
            className="group flex h-full cursor-pointer flex-col rounded-2xl border border-white/[0.08] bg-[#131316]/85 p-8 text-left shadow-2xl backdrop-blur-xl transition-colors duration-200 hover:border-amber-500/35 disabled:cursor-wait"
          >
            <div className="mb-5 inline-flex h-11 w-11 items-center justify-center rounded-xl border border-amber-500/25 bg-[#070709] text-amber-300">
              <Code2 className="h-5 w-5" aria-hidden="true" />
            </div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-amber-300">
              For Developers
            </p>
            <h2 className="mt-3 text-2xl font-bold tracking-tight text-textMain">
              Run deep audits on your public repos to prove founder-ready
              credibility.
            </h2>
            <p className="mt-4 flex-1 text-sm leading-relaxed text-textMuted">
              Publish proof of work, keep your profile current, and show
              employers what you have actually shipped — not what a resume
              claims.
            </p>
            <span className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#F4F4F6] px-4 py-3 text-sm font-semibold tracking-tight text-[#0B0B0D] shadow-sm transition-all duration-200 hover:bg-white">
              {saving === "candidate" ? "Saving..." : "Open Candidate Dashboard"}
              {saving === "candidate" ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              )}
            </span>
          </button>
        </section>
      </div>
    </div>
  );
}
