import Link from "next/link";
import FirewallEngine from "@/components/firewall/firewall-engine";
import AstCompare from "@/components/landing/ast-compare";
import LandingConnect from "@/components/landing/landing-connect";
import { AmbientBackdrop, Reveal } from "@/components/landing/landing-motion";
import PipelineFlow from "@/components/landing/pipeline-flow";
import ScrollFeatures from "@/components/landing/scroll-features";
import { ProvixLogo } from "@/components/ProvixLogo";
import MarketingAuthLink from "@/components/marketing-auth-link";
import { buildPageMetadata } from "@/lib/site";

export const dynamic = "force-static";
export const revalidate = false;

export const metadata = buildPageMetadata(
  "The Architecture Firewall for AI Codebases",
  "Automatically validate boundaries, secrets, and dependencies before the commit lands on main.",
  "/"
);

export default function Home() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0e1117] font-sans text-[#f9fafb]">
      <AmbientBackdrop />

      <Reveal as="header" className="relative border-b border-white/10 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="transition-opacity hover:opacity-80">
            <ProvixLogo />
          </Link>
          <nav className="flex items-center gap-2">
            <Link
              href="/firewall"
              className="hidden rounded-md px-3 py-1.5 text-sm text-[#f9fafb]/60 transition-colors hover:text-[#f9fafb] sm:inline-flex"
            >
              Firewall
            </Link>
            <MarketingAuthLink />
          </nav>
        </div>
      </Reveal>

      <main className="relative mx-auto w-full max-w-6xl px-6 pt-20 pb-32 sm:pt-28">
        <Reveal as="section" className="max-w-3xl">
          <p className="font-mono text-[11px] tracking-[0.22em] text-purple-400 uppercase">Provix</p>
          <h1 className="mt-5 text-4xl leading-[1.08] font-semibold tracking-[-0.04em] text-[#f9fafb] sm:text-5xl lg:text-[3.4rem]">
            Automated Code Integrity & Safety.
            <span className="mt-2 block text-[#f9fafb]/90">Prevent bad code from ever reaching production.</span>
          </h1>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-[#f9fafb]/75 sm:text-lg">
            Automatically validate boundaries, secrets, and dependencies before the commit lands on main.
          </p>
        </Reveal>

        <Reveal className="mt-10" delay={0.12}>
          <LandingConnect />
        </Reveal>

        <AstCompare />
        <PipelineFlow />
        <ScrollFeatures />

        <Reveal as="section" aria-labelledby="interface-heading" className="mt-28">
          <div className="max-w-2xl">
            <p className="font-mono text-[11px] tracking-[0.2em] text-purple-400 uppercase">Interface</p>
            <h2 id="interface-heading" className="mt-3 text-3xl font-semibold tracking-[-0.035em] text-[#f9fafb] sm:text-4xl">
              The checks, in the product.
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-[#f9fafb]/70">
              A pull request comment, the secret and env rules, and a live CLI stream. Each line is OK or FAILED.
            </p>
          </div>
          <div className="relative mt-10">
            <div
              aria-hidden
              className="pointer-events-none absolute -inset-8 rounded-[2rem] bg-[radial-gradient(ellipse_at_center,rgba(168,85,247,0.14),transparent_70%)] blur-2xl"
            />
            <div className="relative">
              <FirewallEngine />
            </div>
          </div>
        </Reveal>
      </main>

      <Reveal as="footer" className="relative border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-4 px-6 py-10 sm:flex-row sm:items-center">
          <p className="text-sm text-[#f9fafb]/45">© {new Date().getFullYear()} Provix · Architecture firewall</p>
          <div className="flex items-center gap-6 text-sm">
            <Link href="/privacy" prefetch={false} className="text-[#f9fafb]/45 transition-colors hover:text-[#f9fafb]">
              Privacy
            </Link>
            <Link href="/terms" prefetch={false} className="text-[#f9fafb]/45 transition-colors hover:text-[#f9fafb]">
              Terms
            </Link>
          </div>
        </div>
      </Reveal>
    </div>
  );
}
