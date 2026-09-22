"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { loginHrefForSignupRole } from "@/lib/account-role";

type Audience = "employer" | "developer";

const cardClass =
  "group flex h-full cursor-pointer flex-col rounded-xl border border-white/[0.08] bg-[#131316]/85 p-6 text-left shadow-2xl backdrop-blur-xl transition-colors duration-200 hover:border-violet-500/25 disabled:cursor-wait sm:p-8";

const ctaClass =
  "mt-8 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold tracking-tight text-white transition-colors duration-200 hover:bg-brandHover";

export default function LandingAudienceCards() {
  const router = useRouter();
  const [pending, setPending] = useState<Audience | null>(null);

  const openAudience = (kind: Audience) => {
    if (pending) {
      return;
    }

    setPending(kind);
    router.push(loginHrefForSignupRole(kind));
  };

  return (
    <section className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
      <button
        type="button"
        onClick={() => openAudience("employer")}
        disabled={pending !== null}
        className={cardClass}
      >
        <p className="rounded-md border border-violet-500/25 bg-violet-500/10 px-2 py-0.5 font-mono text-[11px] tracking-widest text-violet-300 w-fit">
          // 01 FOUNDERS
        </p>
        <h2 className="mt-4 text-xl font-medium tracking-tight text-white">
          Source pre-vetted builders using static code and repository integrity
          analysis.
        </h2>
        <p className="mt-4 flex-1 text-sm leading-relaxed text-zinc-400">
          Skip resume theater. Open the employer console to screen talent
          against verified GitHub artifacts and repository integrity signals.
        </p>
        <span className={ctaClass}>
          {pending === "employer" ? "Opening..." : "Enter Employer Console"}
          <ArrowRight className="h-4 w-4 text-white/70" aria-hidden="true" />
        </span>
      </button>

      <button
        type="button"
        onClick={() => openAudience("developer")}
        disabled={pending !== null}
        className={cardClass}
      >
        <p className="rounded-md border border-violet-500/25 bg-violet-500/10 px-2 py-0.5 font-mono text-[11px] tracking-widest text-violet-300 w-fit">
          // 02 DEVELOPERS
        </p>
        <h2 className="mt-4 text-xl font-medium tracking-tight text-white">
          Run deep audits across public or private repos to prove founder-ready
          credibility.
        </h2>
        <p className="mt-4 flex-1 text-sm leading-relaxed text-zinc-400">
          Publish proof of work, keep your profile current, and show employers
          what you have actually shipped — not what a resume claims.
        </p>
        <span className={ctaClass}>
          {pending === "developer" ? "Opening..." : "Open Candidate Dashboard"}
          <ArrowRight className="h-4 w-4 text-white/70" aria-hidden="true" />
        </span>
      </button>
    </section>
  );
}
