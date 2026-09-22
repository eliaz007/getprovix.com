import Link from "next/link";
import AmbientLighting from "@/components/AmbientLighting";
import { ProvixLogo } from "@/components/ProvixLogo";
import LandingHome from "@/components/landing/landing-home";
import MarketingAuthLink from "@/components/marketing-auth-link";
import { buildPageMetadata } from "@/lib/site";

export const metadata = buildPageMetadata(
  "Verified Candidate Intelligence",
  "Hire developers based on what they've actually built, not what they claim.",
  "/"
);

export default function Home() {
  return (
    <AmbientLighting>
      <header className="sticky top-0 z-50 border-b border-white/[0.08] bg-[#0B0B0D]/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-5">
          <Link href="/" className="hover:opacity-90 transition-opacity">
            <ProvixLogo />
          </Link>
          <nav className="flex items-center gap-3">
            <MarketingAuthLink />
          </nav>
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col px-6 pb-20 pt-16 sm:pt-24">
        <section className="hero-fade-in relative mx-auto max-w-4xl text-center">
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-[-18%] -z-10 h-[340px] w-[min(100%,720px)] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(245,158,11,0.22)_0%,rgba(245,158,11,0.08)_38%,transparent_70%)] blur-3xl"
          />
          <p className="mb-5 inline-flex items-center rounded-full border border-amber-500/25 bg-amber-500/10 px-3 py-1 font-mono text-[11px] font-medium uppercase tracking-widest text-amber-300">
            Don’t explain your code. Prove it.
          </p>
          <h1 className="text-4xl font-extrabold tracking-tight text-textMain sm:text-5xl lg:text-[3.5rem] lg:leading-[1.1]">
            Stop applying with PDFs. Let your code speak for you.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-zinc-400 sm:text-lg">
            Turn your codebase into verified proof of work. Get discovered by
            engineering teams hiring on how you actually ship.
          </p>
        </section>

        <LandingHome />
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-4 px-6 py-8 sm:flex-row sm:items-center">
          <p className="text-xs text-textMuted">
            © {new Date().getFullYear()} Provix. Verified candidate intelligence.
          </p>
          <div className="flex items-center gap-5 text-xs font-medium">
            <Link
              href="/privacy"
              className="text-textMuted transition-colors duration-200 hover:text-textMain"
            >
              Privacy
            </Link>
            <Link
              href="/terms"
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
