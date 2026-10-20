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

      <main className="relative mx-auto flex w-full max-w-6xl flex-col px-6 pb-16 pt-14 sm:pt-20">
        <section className="relative mx-auto w-full max-w-3xl text-center print:hidden">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-0 left-1/2 -z-10 h-[350px] w-[600px] -translate-x-1/2 rounded-full bg-purple-600/15 blur-[120px]"
          />
          <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl lg:text-[3.25rem] lg:leading-[1.12]">
            Vetted Next.js & TypeScript Engineers, Verified in Code
          </h1>
          <p className="mt-4 text-base sm:text-lg text-neutral-400 max-w-2xl mx-auto text-center">
            Built for production-grade developers and technical founders. Get
            verified through repository code audits to join the network, or
            create a founder account to hire contract and full-time talent for
            isolated backlog sprints.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-8">
            <Link
              href="/apply"
              className="w-full sm:w-auto px-7 py-3 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-medium text-center transition-colors shadow-lg shadow-purple-900/30"
            >
              Join Talent Network
            </Link>
            <Link
              href="/signup?role=founder"
              className="w-full sm:w-auto px-6 py-3 rounded-lg border border-neutral-800 bg-neutral-900/80 hover:bg-neutral-800 text-neutral-300 font-medium text-center transition-colors"
            >
              Hire Talent &rarr;
            </Link>
          </div>
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
