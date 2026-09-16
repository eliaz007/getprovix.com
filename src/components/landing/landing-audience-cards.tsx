"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Building2, Code2 } from "lucide-react";
import {
  EMPLOYER_DASHBOARD_PATH,
  loginHrefForSignupRole,
  loadStoredAccountRole,
  normalizeAccountKind,
} from "@/lib/account-role";
import { createClient } from "@/utils/supabase/client";

type Audience = "employer" | "developer";

export default function LandingAudienceCards() {
  const router = useRouter();
  const [pending, setPending] = useState<Audience | null>(null);

  const openAudience = async (kind: Audience) => {
    if (pending) {
      return;
    }

    setPending(kind);

    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push(loginHrefForSignupRole(kind));
        return;
      }

      if (kind === "developer") {
        router.push("/dashboard");
        return;
      }

      const role = await loadStoredAccountRole(supabase, user);
      router.push(
        normalizeAccountKind(role) === "employer"
          ? EMPLOYER_DASHBOARD_PATH
          : loginHrefForSignupRole("employer")
      );
    } catch (error) {
      console.error("Landing audience route failed:", error);
      router.push(loginHrefForSignupRole(kind));
    } finally {
      setPending(null);
    }
  };

  return (
    <section className="mt-20 grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
      <button
        type="button"
        onClick={() => void openAudience("employer")}
        disabled={pending !== null}
        className="group flex h-full cursor-pointer flex-col rounded-2xl border border-border bg-panel p-8 text-left transition-colors duration-200 hover:border-white/15 hover:bg-white/[0.03] disabled:cursor-wait"
      >
        <div className="mb-5 inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-background text-brand">
          <Building2 className="h-5 w-5" aria-hidden="true" />
        </div>
        <p className="text-[11px] font-bold uppercase tracking-widest text-brand">
          For Founders
        </p>
        <h2 className="mt-3 text-2xl font-bold tracking-tight text-textMain">
          Source pre-vetted builders using static code and repository integrity
          analysis.
        </h2>
        <p className="mt-4 flex-1 text-sm leading-relaxed text-textMuted">
          Skip resume theater. Open the employer console to screen talent
          against verified GitHub artifacts and repository integrity signals.
        </p>
        <span className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-brand px-4 py-3 text-sm font-bold tracking-tight text-white transition-colors duration-200 group-hover:bg-brandHover">
          {pending === "employer" ? "Opening..." : "Enter Employer Console"}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </span>
      </button>

      <button
        type="button"
        onClick={() => void openAudience("developer")}
        disabled={pending !== null}
        className="group flex h-full cursor-pointer flex-col rounded-2xl border border-border bg-panel p-8 text-left transition-colors duration-200 hover:border-white/15 hover:bg-white/[0.03] disabled:cursor-wait"
      >
        <div className="mb-5 inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-background text-sky-400">
          <Code2 className="h-5 w-5" aria-hidden="true" />
        </div>
        <p className="text-[11px] font-bold uppercase tracking-widest text-sky-400">
          For Developers
        </p>
        <h2 className="mt-3 text-2xl font-bold tracking-tight text-textMain">
          Run deep audits on your public repos to prove founder-ready
          credibility.
        </h2>
        <p className="mt-4 flex-1 text-sm leading-relaxed text-textMuted">
          Publish proof of work, keep your profile current, and show employers
          what you have actually shipped — not what a resume claims.
        </p>
        <span className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-sky-400 px-4 py-3 text-sm font-bold tracking-tight text-white transition-colors duration-200 group-hover:bg-sky-500">
          {pending === "developer" ? "Opening..." : "Open Candidate Dashboard"}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </span>
      </button>
    </section>
  );
}
