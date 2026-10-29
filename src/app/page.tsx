import Link from "next/link";
import AmbientLighting from "@/components/AmbientLighting";
import LandingScan from "@/components/landing/landing-scan";
import { ProvixLogo } from "@/components/ProvixLogo";
import MarketingAuthLink from "@/components/marketing-auth-link";
import { buildPageMetadata } from "@/lib/site";

export const dynamic = "force-static";
export const revalidate = false;

export const metadata = buildPageMetadata(
  "The Architecture Firewall for AI Codebases",
  "Scan a repository for architectural bloat, monolithic files, and circular dependencies. Auto-fix the worst offenders before they hit production.",
  "/"
);

const PILLARS = [
  {
    kicker: "01",
    title: "Instant Architectural Audits",
    body: "Catch architectural bloat, oversized files, and circular dependencies before they compound into a rewrite.",
  },
  {
    kicker: "02",
    title: "One-Click AI Auto-Refactoring",
    body: "Break a monolith into cleaner modules and review the generated diff without leaving the report.",
  },
  {
    kicker: "03",
    title: "CI/CD & Team Guardrails",
    body: "Block structural rot from hitting main. The same rules run in the dashboard and in the pipeline.",
  },
] as const;

export default function Home() {
  return (
    <AmbientLighting>
      <header className="border-b border-border print:hidden">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-5">
          <Link href="/" className="transition-opacity hover:opacity-90">
            <ProvixLogo />
          </Link>
          <nav className="flex items-center gap-3">
            <MarketingAuthLink />
          </nav>
        </div>
      </header>

      <main className="relative mx-auto flex w-full max-w-6xl flex-col px-6 pb-20 pt-14 sm:pt-20">
        <section className="relative mx-auto w-full max-w-3xl text-center">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-0 left-1/2 -z-10 h-[350px] w-[600px] -translate-x-1/2 rounded-full bg-purple-600/15 blur-[120px]"
          />
          <p className="text-xs font-semibold tracking-[0.18em] text-violet-300 uppercase">
            Architecture Firewall
          </p>
          <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-white sm:text-5xl lg:text-[3.25rem] lg:leading-[1.12]">
            Stop AI Spaghetti Code Before It Hits Production
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-center text-base text-neutral-400 sm:text-lg">
            The architecture firewall for the vibe coding era. Provix scans for
            architectural bloat, monolithic files, and circular dependencies,
            then auto-fixes them in one click.
          </p>
          <LandingScan />
        </section>

        <section className="mx-auto mt-16 w-full max-w-5xl">
          <h2 className="text-center text-2xl font-bold tracking-tight text-white">
            Built to keep AI-written codebases shippable
          </h2>
          <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
            {PILLARS.map((pillar) => (
              <article
                key={pillar.kicker}
                className="rounded-2xl border border-white/10 bg-[#101218] p-6 text-left"
              >
                <p className="font-mono text-[11px] tracking-widest text-violet-300">{pillar.kicker}</p>
                <h3 className="mt-3 text-lg font-semibold text-white">{pillar.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-neutral-400">{pillar.body}</p>
              </article>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-border print:hidden">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-4 px-6 py-8 sm:flex-row sm:items-center">
          <p className="text-xs text-textMuted">
            © {new Date().getFullYear()} Provix. The architecture firewall for AI codebases.
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
