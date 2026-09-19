import Link from "next/link";
import { ProvixLogo } from "@/components/ProvixLogo";
import LandingAuditForm from "@/components/landing/landing-audit-form";
import LandingAudienceCards from "@/components/landing/landing-audience-cards";
import { buildPageMetadata } from "@/lib/site";

export const metadata = buildPageMetadata(
  "Your code is your credential",
  "Instant architectural audits for developers. Provix evaluates code hygiene and structural depth to turn your side projects into a verified ticket into our engineering network.",
  "/"
);

const SIGN_IN_LINK_CLASS =
  "inline-flex items-center justify-center bg-zinc-900 border border-zinc-800 text-zinc-300 text-xs px-4 py-2 rounded-lg transition-colors duration-200 hover:bg-zinc-800 hover:text-white";

export default function Home() {
  return (
    <div className="min-h-screen bg-background text-textMuted">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <Link href="/" className="transition-opacity hover:opacity-90">
            <ProvixLogo />
          </Link>
          {/* Dedicated auth page with Google + GitHub providers: src/app/login/page.tsx */}
          <Link href="/login" className={SIGN_IN_LINK_CLASS}>
            Sign In
          </Link>
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col px-6 pb-20 pt-16 sm:pt-24">
        <section className="hero-fade-in mx-auto max-w-4xl text-center">
          <p className="mb-5 text-[11px] font-bold uppercase tracking-widest text-brand">
            Provix
          </p>
          <h1 className="text-4xl font-extrabold tracking-tight text-textMain sm:text-5xl lg:text-[3.5rem] lg:leading-[1.1]">
            Your code is your credential.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-textMuted sm:text-lg">
            Instant architectural audits for developers. Provix evaluates code
            hygiene and structural depth to turn your side projects into a
            verified ticket into our engineering network.
          </p>
        </section>

        <LandingAuditForm />

        <div id="employers" className="scroll-mt-24">
          <LandingAudienceCards />
        </div>
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
    </div>
  );
}
