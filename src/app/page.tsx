import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { ProvixLogo } from "@/components/ProvixLogo";
import LandingAuditForm from "@/components/landing/landing-audit-form";
import LandingAudienceCards from "@/components/landing/landing-audience-cards";
import MarketingAuthLink from "@/components/marketing-auth-link";
import { buildPageMetadata } from "@/lib/site";

export const metadata = buildPageMetadata(
  "Verified Candidate Intelligence",
  "Hire developers based on what they've actually built, not what they claim.",
  "/"
);

export default function Home() {
  return (
    <div className="min-h-screen bg-background text-textMuted">
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
        <section className="hero-fade-in mx-auto max-w-4xl text-center">
          <p className="mb-5 inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-brand">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            Proof-of-work hiring
          </p>
          <h1 className="text-4xl font-extrabold tracking-tight text-textMain sm:text-5xl lg:text-[3.5rem] lg:leading-[1.1]">
            Hire developers based on what they&apos;ve actually built, not what
            they claim.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-textMuted sm:text-lg">
            Provix audits public repositories for integrity, architecture, and
            execution so founders can source builders from verified work — not
            resume claims.
          </p>
        </section>

        <LandingAuditForm />

        <LandingAudienceCards />
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
