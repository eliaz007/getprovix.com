import Link from "next/link";
import { ArrowRight, Building2, Code2, ShieldCheck } from "lucide-react";
import { ProvixLogo } from "@/components/ProvixLogo";
import LandingAuditForm from "@/components/landing/landing-audit-form";
import { buildPageMetadata } from "@/lib/site";

export const metadata = buildPageMetadata(
  "Verified Candidate Intelligence",
  "Hire developers based on what they've actually built, not what they claim.",
  "/"
);

const founderHref = "/employer";
const candidateHref = "/dashboard";

export default function Home() {
  return (
    <div className="min-h-screen bg-background text-textMuted">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-5">
          <Link href="/" className="hover:opacity-90 transition-opacity">
            <ProvixLogo />
          </Link>
          <nav className="flex items-center gap-3">
            <Link
              href="/login"
              className="rounded-lg border border-border bg-transparent px-4 py-2 text-sm font-semibold text-textMain transition-colors duration-200 hover:bg-white/5"
            >
              Sign in
            </Link>
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

          <LandingAuditForm />
        </section>

        <section className="mt-20 grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
          <article className="flex h-full flex-col rounded-2xl border border-border bg-panel p-8">
            <div className="mb-5 inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-background text-brand">
              <Building2 className="h-5 w-5" aria-hidden="true" />
            </div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-brand">
              For Founders
            </p>
            <h2 className="mt-3 text-2xl font-bold tracking-tight text-textMain">
              Source pre-vetted builders using static code and repository
              integrity analysis.
            </h2>
            <p className="mt-4 flex-1 text-sm leading-relaxed text-textMuted">
              Skip resume theater. Open the employer console to screen talent
              against verified GitHub artifacts and repository integrity signals.
            </p>
            <Link
              href={founderHref}
              className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-brand text-white px-4 py-3 text-sm font-bold tracking-tight transition-colors duration-200 hover:bg-brandHover cursor-pointer"
            >
              Enter Employer Console
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </article>

          <article className="flex h-full flex-col rounded-2xl border border-border bg-panel p-8">
            <div className="mb-5 inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-background text-sky-400">
              <Code2 className="h-5 w-5" aria-hidden="true" />
            </div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-sky-400">
              For Developers
            </p>
            <h2 className="mt-3 text-2xl font-bold tracking-tight text-textMain">
              Run deep audits on your public repos to prove founder-ready
              credibility.
            </h2>
            <p className="mt-4 flex-1 text-sm leading-relaxed text-textMuted">
              Publish proof of work, keep your profile current, and show
              employers what you have actually shipped — not what a resume
              claims.
            </p>
            <Link
              href={candidateHref}
              className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-transparent px-4 py-3 text-sm font-bold tracking-tight text-white transition-colors duration-200 hover:bg-white/5 cursor-pointer"
            >
              Open Candidate Dashboard
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </article>
        </section>
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
            <Link
              href="/pricing"
              className="text-textMuted transition-colors duration-200 hover:text-textMain"
            >
              Pricing
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
