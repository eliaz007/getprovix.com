"use client";

import Link from "next/link";
import { SpotlightCard } from "@/components/landing/landing-motion";

const cardCtaClass =
  "group/cta inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-medium transition-all duration-300 hover:border-white/20 hover:bg-white/[0.07]";

export default function LandingAudienceCards() {
  return (
    <section id="hiring" className="mx-auto mt-6 w-full max-w-4xl scroll-mt-24">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
        <SpotlightCard className="flex h-full flex-col p-6 text-left sm:p-8">
          <p className="font-mono text-[11px] tracking-widest text-violet-300 transition-colors duration-300 group-hover:text-violet-200">
            {"// FOUNDERS"}
          </p>
          <h2 className="mt-4 text-xl font-semibold tracking-tight text-white transition-transform duration-300 group-hover:-translate-y-0.5">
            Objective Code Telemetry Over Resumes
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-neutral-400 transition-colors duration-300 group-hover:text-neutral-300">
            Skip speculative resume screening. Inspect verified repository memos
            revealing actual test coverage, error resilience, and deployment
            pipelines before first contact.
          </p>
          <div className="mt-auto pt-6">
            <a
              href="mailto:elias@getprovix.com?subject=Provix%20Roster%20Inquiry"
              className={`${cardCtaClass} text-purple-400 hover:text-purple-300`}
            >
              <span>Request Access to Roster</span>
              <span
                aria-hidden
                className="inline-block transition-transform duration-300 group-hover/cta:translate-x-0.5"
              >
                →
              </span>
            </a>
          </div>
        </SpotlightCard>

        <SpotlightCard className="flex h-full flex-col p-6 text-left sm:p-8">
          <p className="font-mono text-[11px] tracking-widest text-cyan-400 transition-colors duration-300 group-hover:text-cyan-300">
            {"// BUILDERS"}
          </p>
          <h2 className="mt-4 text-xl font-semibold tracking-tight text-white transition-transform duration-300 group-hover:-translate-y-0.5">
            Production Proof Over Interviews
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-neutral-400 transition-colors duration-300 group-hover:text-neutral-300">
            Let your codebase speak for itself. Benchmark your repository against
            rigorous production standards and unlock direct founder introductions.
          </p>
          <div className="mt-auto pt-6">
            <Link
              href="/login?next=/dashboard/auditor"
              prefetch={false}
              className={`${cardCtaClass} text-cyan-400 hover:text-cyan-300`}
            >
              <span>Audit Your GitHub Repo</span>
              <span
                aria-hidden
                className="inline-block transition-transform duration-300 group-hover/cta:translate-x-0.5"
              >
                →
              </span>
            </Link>
          </div>
        </SpotlightCard>
      </div>
    </section>
  );
}
