"use client";

import Link from "next/link";
import { SpotlightCard } from "@/components/landing/landing-motion";

const cardCtaClass =
  "group/cta inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-medium transition-all duration-300 hover:border-white/20 hover:bg-white/[0.07]";

export default function LandingAudienceCards() {
  return (
    <section id="product" className="mx-auto mt-6 w-full max-w-4xl scroll-mt-24">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
        <SpotlightCard className="flex h-full flex-col p-6 text-left sm:p-8">
          <p className="font-mono text-[11px] tracking-widest text-violet-300 transition-colors duration-300 group-hover:text-violet-200">
            {"// SECURITY"}
          </p>
          <h2 className="mt-4 text-xl font-semibold tracking-tight text-white transition-transform duration-300 group-hover:-translate-y-0.5">
            Catch Next.js &amp; Supabase Risks Before Merge
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-neutral-400 transition-colors duration-300 group-hover:text-neutral-300">
            Scan connected GitHub repositories for secret leaks, client-side
            database exposure, insecure session auth, and architecture hotspots.
            Review findings in one workspace.
          </p>
          <div className="mt-auto pt-6">
            <Link
              href="/login?next=/dashboard"
              prefetch={false}
              className={`${cardCtaClass} text-purple-400 hover:text-purple-300`}
            >
              <span>Open Security Workspace</span>
              <span
                aria-hidden
                className="inline-block transition-transform duration-300 group-hover/cta:translate-x-0.5"
              >
                →
              </span>
            </Link>
          </div>
        </SpotlightCard>

        <SpotlightCard className="flex h-full flex-col p-6 text-left sm:p-8">
          <p className="font-mono text-[11px] tracking-widest text-cyan-400 transition-colors duration-300 group-hover:text-cyan-300">
            {"// REMEDIATION"}
          </p>
          <h2 className="mt-4 text-xl font-semibold tracking-tight text-white transition-transform duration-300 group-hover:-translate-y-0.5">
            Verified Fix Pull Requests
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-neutral-400 transition-colors duration-300 group-hover:text-neutral-300">
            For supported findings, Provix drafts a patch, runs a TypeScript
            preflight, and opens a pull request you review and merge. Source is
            processed ephemerally for analysis—never stored as a permanent
            archive and never used to train models.
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
