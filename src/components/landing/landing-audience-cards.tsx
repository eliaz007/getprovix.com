import Link from "next/link";

const cardClass =
  "flex h-full flex-col rounded-xl border border-neutral-800/80 bg-[#0d0f17] p-6 text-left sm:p-8";

const cardCtaClass =
  "mt-auto inline-flex pt-6 text-sm font-medium transition-colors duration-200";

export default function LandingAudienceCards() {
  return (
    <section id="hiring" className="mx-auto mt-6 w-full max-w-4xl scroll-mt-24">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
        <div className={cardClass}>
          <p className="font-mono text-[11px] tracking-widest text-violet-300">
            // FOUNDERS
          </p>
          <h2 className="mt-4 text-xl font-semibold tracking-tight text-white">
            Objective Code Telemetry Over Resumes
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-neutral-400">
            Skip speculative resume screening. Inspect verified repository memos
            revealing actual test coverage, error resilience, and deployment
            pipelines before first contact.
          </p>
          <a
            href="mailto:elias@getprovix.com?subject=Provix%20Roster%20Inquiry"
            className={`${cardCtaClass} text-violet-300 hover:text-violet-200`}
          >
            Request Access to Roster →
          </a>
        </div>

        <div className={cardClass}>
          <p className="font-mono text-[11px] tracking-widest text-cyan-400">
            // BUILDERS
          </p>
          <h2 className="mt-4 text-xl font-semibold tracking-tight text-white">
            Production Proof Over Interviews
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-neutral-400">
            Let your codebase speak for itself. Benchmark your repository against
            rigorous production standards and unlock direct founder introductions.
          </p>
          <Link
            href="/login?next=/dashboard/auditor"
            prefetch={false}
            className={`${cardCtaClass} text-cyan-400 hover:text-cyan-300`}
          >
            Audit Your GitHub Repo →
          </Link>
        </div>
      </div>
    </section>
  );
}
