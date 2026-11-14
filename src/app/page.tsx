import Link from "next/link";
import { ProvixLogo } from "@/components/ProvixLogo";
import ComparisonShowcase from "@/components/ComparisonShowcase";
import PrPreviewCard from "@/components/landing/pr-preview-card";
import ConnectRepositoryButton from "@/components/onboarding/connect-repository-button";
import { buildPageMetadata, SITE_DESCRIPTION } from "@/lib/site";

export const dynamic = "force-static";
export const revalidate = false;

export const metadata = buildPageMetadata(
  "Automated Security for Next.js and Supabase",
  SITE_DESCRIPTION,
  "/"
);

const primaryButton =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold tracking-tight text-black transition hover:bg-zinc-200 disabled:cursor-wait disabled:opacity-70";

const tokenButton =
  "inline-flex items-center rounded-xl border border-white/10 bg-white/[0.02] px-5 py-3 font-mono text-xs text-zinc-300 transition hover:border-white/20 hover:bg-white/[0.04] hover:text-white";

const signInPill =
  "inline-flex items-center rounded-full border border-white/10 bg-white/[0.03] px-3.5 py-1.5 text-sm font-medium text-zinc-300 transition hover:border-white/20 hover:bg-white/[0.06] hover:text-white";

const monoLabel =
  "font-mono text-[11px] uppercase tracking-[0.22em] text-zinc-500";

const cardShell =
  "rounded-xl border border-white/10 bg-zinc-950/80 shadow-[0_0_0_1px_rgba(139,92,246,0.08)]";

const TRUST_CARDS = [
  {
    title: "Never Stored",
    body: "We scan your code in memory and delete it immediately after the scan finishes.",
  },
  {
    title: "Never Used for AI Training",
    body: "Your private code is never used to train any AI models.",
  },
  {
    title: "You Control Every Merge",
    body: "Provix only reads selected repos and opens a PR—nothing changes without your approval.",
  },
] as const;

export default function Home() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-zinc-950 font-sans text-zinc-100">
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden
        style={{
          background:
            "radial-gradient(ellipse 70% 55% at 18% 0%, rgba(124,58,237,0.28), transparent 60%), radial-gradient(ellipse 50% 40% at 88% 78%, rgba(16,185,129,0.08), transparent 55%)",
        }}
      />

      <div className="relative z-10 mx-auto min-h-screen max-w-6xl px-4 sm:px-6">
        <header className="relative z-20 flex items-center justify-between pt-6 pb-2">
          <Link href="/" aria-label="Provix home">
            <ProvixLogo />
          </Link>
          <Link href="/onboarding" prefetch={false} className={signInPill}>
            Sign in
          </Link>
        </header>

        <section className="py-14 lg:py-20">
          <div className="mx-auto max-w-3xl text-center lg:mx-0 lg:max-w-3xl lg:text-left">
            <p className={`${monoLabel} inline-flex items-center gap-2`}>
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-violet-400" />
              Next.js · TypeScript · Supabase
            </p>
            <h1 className="mt-5 text-4xl font-extrabold tracking-tight text-white md:text-5xl lg:text-6xl">
              Find the bug. Open the fix PR.
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-zinc-400 md:text-lg lg:mx-0">
              Provix scans your Next.js, TypeScript, and Supabase repo for
              security bugs and opens a Pull Request with the fix—checked with{" "}
              <span className="font-mono text-zinc-300">tsc</span> so it won&apos;t
              break your build.
            </p>
            <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
              <ConnectRepositoryButton
                label="Install GitHub App"
                className={primaryButton}
              />
              <Link href="/onboarding" prefetch={false} className={tokenButton}>
                Scan with Access Token
              </Link>
            </div>
          </div>
        </section>

        <PrPreviewCard />

        <ComparisonShowcase />

        <section
          id="trust"
          aria-labelledby="trust-heading"
          className="scroll-mt-16 border-t border-white/10 py-14"
        >
          <div className="mb-6 max-w-2xl">
            <p className={monoLabel}>Code Privacy &amp; Security</p>
            <h2
              id="trust-heading"
              className="mt-3 text-2xl font-extrabold tracking-tight text-white"
            >
              Your code stays yours
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-zinc-400">
              Straight answers before you connect GitHub. More detail is in the{" "}
              <Link
                href="/privacy"
                prefetch={false}
                className="text-zinc-200 underline-offset-2 hover:underline"
              >
                Privacy Policy
              </Link>
              .
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {TRUST_CARDS.map((card) => (
              <article key={card.title} className={`${cardShell} min-w-0 p-6 sm:p-8`}>
                <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-emerald-400">
                  {card.title}
                </p>
                <p className="mt-4 text-sm leading-relaxed text-zinc-400">
                  {card.body}
                </p>
              </article>
            ))}
          </div>
        </section>

        <footer className="border-t border-white/10 py-14">
          <h2 className="max-w-xl text-3xl font-extrabold tracking-tight text-white md:text-4xl">
            Scan a repo. Merge the fix when you&apos;re ready.
          </h2>
          <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <ConnectRepositoryButton
              label="Install GitHub App"
              className={primaryButton}
            />
            <Link href="/onboarding" prefetch={false} className={tokenButton}>
              Scan with Access Token
            </Link>
          </div>
          <div className="mt-10 flex flex-col gap-4 border-t border-white/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-500">
              getprovix.com
            </p>
            <div className="flex items-center gap-5 font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-500">
              <Link
                href="/privacy"
                prefetch={false}
                className="transition hover:text-zinc-200"
              >
                Privacy
              </Link>
              <Link
                href="/terms"
                prefetch={false}
                className="transition hover:text-zinc-200"
              >
                Terms
              </Link>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
