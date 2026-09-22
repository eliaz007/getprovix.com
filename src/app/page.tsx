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
      <header className="border-b border-border">
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
        <section className="hero-fade-in relative mx-auto max-w-4xl overflow-hidden text-center">
          <div className="pointer-events-none absolute top-1/4 left-1/2 -z-10 h-[380px] w-[650px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-b from-violet-600/18 via-indigo-500/10 to-transparent blur-[140px]" />
          <p className="relative mb-5 inline-flex rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 font-mono text-[11px] font-medium uppercase tracking-widest text-cyan-400 backdrop-blur-md">
            Don’t explain your code. Prove it.
          </p>
          <h1 className="relative text-4xl font-extrabold tracking-tight text-textMain sm:text-5xl lg:text-[3.5rem] lg:leading-[1.1]">
            Stop applying with PDFs. Let your code speak for you.
          </h1>
          <p className="relative mx-auto mt-5 max-w-2xl text-base leading-relaxed text-textMuted sm:text-lg">
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
