import Link from "next/link";
import AmbientLighting from "@/components/AmbientLighting";
import { ProvixLogo } from "@/components/ProvixLogo";
import LandingHome from "@/components/landing/landing-home";
import MarketingAuthLink from "@/components/marketing-auth-link";
import { buildPageMetadata } from "@/lib/site";

export const dynamic = "force-static";
export const revalidate = false;

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

      <main className="relative mx-auto flex max-w-6xl flex-col px-6 pb-20 pt-16 sm:pt-24 md:overflow-x-clip">
        <section className="relative mx-auto max-w-4xl text-center">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-16 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full md:top-10 md:-z-10 md:h-[450px] md:w-[720px] md:blur-[140px]"
            style={{
              background:
                "radial-gradient(ellipse at center, rgba(124, 58, 237, 0.28), rgba(79, 70, 229, 0.12) 40%, transparent 70%)",
            }}
          />
          <p className="mb-5 font-mono text-[11px] font-medium uppercase tracking-widest text-cyan-400">
            Don’t explain your code. Prove it.
          </p>
          <h1 className="text-4xl font-extrabold tracking-tight text-textMain sm:text-5xl lg:text-[3.5rem] lg:leading-[1.1]">
            Stop applying with PDFs. Let your code speak for you.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-textMuted sm:text-lg">
            Turn your codebase into verified proof of work. Get discovered by
            engineering teams hiring on how you actually ship.
          </p>
        </section>

        <LandingHome isPublicTeaser />
      </main>

      <footer className="border-t border-border">
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
