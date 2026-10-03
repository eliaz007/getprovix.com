import Link from "next/link";
import AmbientLighting from "@/components/AmbientLighting";
import InteractiveDemo from "@/components/InteractiveDemo";
import { ProvixLogo } from "@/components/ProvixLogo";
import LandingHome from "@/components/landing/landing-home";
import MarketingAuthLink from "@/components/marketing-auth-link";
import { buildPageMetadata } from "@/lib/site";

export const dynamic = "force-static";
export const revalidate = false;

export const metadata = buildPageMetadata(
  "The Verified Roster of High Signal Engineers",
  "Provix audits public codebases for test resilience, production architecture, and automated CI workflows. Only repositories scoring 75 or higher qualify for the public roster.",
  "/"
);

export default function Home() {
  return (
    <AmbientLighting>
      <header className="border-b border-border print:hidden">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-5">
          <Link href="/" className="transition-opacity hover:opacity-90">
            <ProvixLogo />
          </Link>
          <nav className="flex items-center gap-3">
            <a
              href="mailto:elias@getprovix.com?subject=Provix%20Roster%20Inquiry"
              className="rounded-lg border border-transparent px-3 py-2 text-sm font-semibold text-textMuted transition-colors duration-200 hover:text-textMain"
            >
              Hiring Engineers?
            </a>
            <MarketingAuthLink />
          </nav>
        </div>
      </header>

      <main className="relative mx-auto flex w-full max-w-6xl flex-col px-6 pb-16 pt-14 sm:pb-20 sm:pt-20">
        <section className="relative mx-auto w-full max-w-3xl text-center print:hidden">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-12 left-1/2 h-56 w-56 -translate-x-1/2 rounded-full md:top-8 md:-z-10 md:h-[380px] md:w-[640px] md:blur-[140px]"
            style={{
              background:
                "radial-gradient(ellipse at center, rgba(124, 58, 237, 0.28), rgba(79, 70, 229, 0.12) 40%, transparent 70%)",
            }}
          />
          <p className="mb-5 font-mono text-[11px] font-medium uppercase tracking-widest text-cyan-400">
            Verified Engineering Benchmark
          </p>
          <h1 className="text-4xl font-extrabold tracking-tight text-textMain sm:text-5xl lg:text-[3.25rem] lg:leading-[1.12]">
            The Verified Roster of High Signal Engineers
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-textMuted sm:text-lg">
            Provix audits public codebases for test resilience, production
            architecture, and automated CI workflows. Only repositories scoring
            75 or higher qualify for the public roster.
          </p>
        </section>

        <InteractiveDemo />
        <LandingHome />
      </main>

      <footer className="border-t border-border print:hidden">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-4 px-6 py-8 sm:flex-row sm:items-center">
          <p className="text-xs text-textMuted">
            © {new Date().getFullYear()} Provix. Verified candidate intelligence.
          </p>
          <div className="flex items-center gap-5 text-xs font-medium">
            <Link
              href="/privacy"
              prefetch={false}
              className="text-textMuted transition-colors duration-200 hover:text-textMain"
            >
              Privacy
            </Link>
            <Link
              href="/terms"
              prefetch={false}
              className="text-textMuted transition-colors duration-200 hover:text-textMain"
            >
              Terms
            </Link>
          </div>
        </div>
      </footer>
    </AmbientLighting>
  );
}
