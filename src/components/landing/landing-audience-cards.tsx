"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { loginHrefForSignupRole } from "@/lib/login-href";

const FOUNDER_MAILTO =
  "mailto:elias@getprovix.com?subject=Provix%20Roster%20Inquiry";

const cardClass =
  "group flex h-full cursor-pointer flex-col rounded-xl border border-neutral-800/80 bg-[#0d0f17] p-6 text-left transition-colors duration-200 hover:border-neutral-700/80 disabled:cursor-wait sm:p-8";

const ctaClass =
  "mt-8 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-neutral-700 bg-transparent px-4 py-2.5 text-sm font-medium tracking-tight text-white transition-colors duration-200 group-hover:border-neutral-500";

export default function LandingAudienceCards() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const openBuilder = () => {
    if (pending) {
      return;
    }

    setPending(true);
    router.push(loginHrefForSignupRole("developer"));
  };

  return (
    <section className="mx-auto mt-16 w-full max-w-4xl">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
        <a href={FOUNDER_MAILTO} className={cardClass}>
          <p className="font-mono text-[11px] tracking-widest text-violet-300">
            // FOUNDERS
          </p>
          <h2 className="mt-4 text-xl font-semibold tracking-tight text-white">
            Objective Code Telemetry Over Resumes
          </h2>
          <p className="mt-4 flex-1 text-sm leading-relaxed text-neutral-400">
            Skip speculative resume screening. Inspect verified repository memos
            revealing actual test coverage, error resilience, and deployment
            pipelines before first contact.
          </p>
          <span className={ctaClass}>
            Hiring Engineers?
            <ArrowRight className="h-4 w-4 text-neutral-400" aria-hidden="true" />
          </span>
        </a>

        <button
          type="button"
          onClick={openBuilder}
          disabled={pending}
          className={cardClass}
        >
          <p className="font-mono text-[11px] tracking-widest text-cyan-400">
            // BUILDERS
          </p>
          <h2 className="mt-4 text-xl font-semibold tracking-tight text-white">
            Production Proof Over LeetCode
          </h2>
          <p className="mt-4 flex-1 text-sm leading-relaxed text-neutral-400">
            Let your codebase speak for itself. Benchmark your repository against
            rigorous production standards and unlock direct founder introductions.
          </p>
          <span className={ctaClass}>
            {pending ? "Opening..." : "Benchmark Your Repository"}
            <ArrowRight className="h-4 w-4 text-neutral-400" aria-hidden="true" />
          </span>
        </button>
      </div>
    </section>
  );
}
