import Link from "next/link";
import { ProvixLogo } from "@/components/ProvixLogo";
import ConnectRepositoryButton from "@/components/onboarding/connect-repository-button";
import { buildPageMetadata } from "@/lib/site";

export const dynamic = "force-static";
export const revalidate = false;

export const metadata = buildPageMetadata(
  "AST security for Next.js",
  "Provix inspects Next.js and TypeScript pull requests at the AST level, then commits verified patches to your branch.",
  "/"
);

const primaryButton =
  "inline-flex items-center justify-center gap-2 rounded-[4px] bg-[#7c3aed] px-5 py-3 text-sm font-medium text-white transition hover:bg-[#6d28d9] disabled:cursor-wait disabled:opacity-70";

const navButton =
  "inline-flex items-center justify-center rounded-[4px] bg-[#7c3aed] px-3.5 py-1.5 text-xs font-medium text-white transition hover:bg-[#6d28d9] disabled:cursor-wait disabled:opacity-70";

const tokenButton =
  "inline-flex items-center rounded-[4px] border border-white/10 bg-[#141414] px-5 py-3 font-mono text-xs text-[#ededed] transition hover:bg-white/5";

function Crosshair({ className }: { className: string }) {
  return (
    <svg
      width="7"
      height="7"
      viewBox="0 0 7 7"
      className={className}
      aria-hidden="true"
    >
      <path d="M3.5 0v7M0 3.5h7" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

function CornerMarks() {
  const base = "pointer-events-none absolute text-[#71717a]";
  return (
    <>
      <Crosshair className={`${base} top-0 left-0 -translate-x-1/2 -translate-y-1/2`} />
      <Crosshair className={`${base} top-0 right-0 translate-x-1/2 -translate-y-1/2`} />
      <Crosshair className={`${base} bottom-0 left-0 -translate-x-1/2 translate-y-1/2`} />
      <Crosshair className={`${base} right-0 bottom-0 translate-x-1/2 translate-y-1/2`} />
    </>
  );
}

export default function Home() {
  return (
    <div className="min-h-screen bg-[#090A0F] font-sans text-[#ededed]">
      <div className="mx-auto min-h-screen max-w-[1200px] border-x border-white/10">
        <header className="sticky top-0 z-20 h-14 border-b border-white/10 bg-[#090A0F]/90">
          <div className="flex h-full items-center justify-between px-4 md:px-6">
            <Link href="/" className="flex items-center gap-2.5">
              <ProvixLogo className="h-6 w-6" showText={false} />
              <span className="text-sm font-semibold tracking-tight text-white">PROVIX</span>
              <span className="hidden border border-white/10 px-1.5 py-0.5 font-mono text-[10px] tracking-wide text-[#71717a] sm:inline">
                v0.4 // CLOSED BETA
              </span>
            </Link>
            <nav className="flex items-center gap-4 md:gap-6">
              <Link href="#architecture" className="hidden font-mono text-[11px] text-[#a1a1aa] transition hover:text-[#ededed] md:inline">
                Architecture
              </Link>
              <Link href="#ast" className="hidden font-mono text-[11px] text-[#a1a1aa] transition hover:text-[#ededed] lg:inline">
                AST Engine
              </Link>
              <Link href="#security" className="hidden font-mono text-[11px] text-[#a1a1aa] transition hover:text-[#ededed] md:inline">
                Security
              </Link>
              <Link href="/onboarding" prefetch={false} className="font-mono text-[11px] text-[#a1a1aa] transition hover:text-[#ededed]">
                Onboarding
              </Link>
              <ConnectRepositoryButton label="Install" className={navButton} />
            </nav>
          </div>
        </header>

        <section className="relative grid border-b border-white/10 lg:grid-cols-12">
          <CornerMarks />
          <div className="border-b border-white/10 p-8 md:p-14 lg:col-span-7 lg:border-r lg:border-b-0">
            <p className="inline-flex items-center gap-2 font-mono text-[11px] tracking-[0.14em] text-[#a1a1aa]">
              <span className="inline-block h-1.5 w-1.5 bg-[#7c3aed]" />
              AUTONOMOUS AST SECURITY & TYPE HEALING
            </p>
            <h1 className="mt-6 max-w-xl text-4xl leading-[1.05] font-semibold tracking-[-0.04em] text-[#ededed] md:text-6xl">
              Catch and heal Next.js vulnerabilities before the PR merges.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-[#a1a1aa] md:text-lg">
              Provix inspects Next.js App Router and TypeScript pull requests at the AST level.
              It finds security flaws, unvalidated inputs, and type-safety leaks, then commits a
              verified patch directly to your branch.
            </p>
            <div className="mt-10 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
              <ConnectRepositoryButton label="Install GitHub App [->]" className={primaryButton} />
              <Link href="/onboarding" prefetch={false} className={tokenButton}>
                Use Access Token
              </Link>
            </div>
          </div>

          <div className="flex flex-col justify-between bg-[#0a0a0a] p-6 md:p-10 lg:col-span-5">
            <div className="border border-white/10 bg-[#141414]">
              <div className="flex items-center justify-between gap-3 border-b border-white/10 px-3 py-2">
                <p className="truncate font-mono text-[11px] text-[#a1a1aa]">
                  PR #204 · app/api/webhooks/stripe/route.ts
                </p>
                <span className="shrink-0 font-mono text-[10px] text-[#7c3aed]">[AST PATCH READY]</span>
              </div>
              <pre className="overflow-x-auto p-3 font-mono text-xs leading-6">
                <div className="border-l-2 border-[#EF4444] bg-[#EF4444]/10 px-2 text-[#FCA5A5]">
                  - const event = req.body as any;
                </div>
                <div className="border-l-2 border-[#EF4444] bg-[#EF4444]/10 px-2 text-[#FCA5A5]">
                  - await applyCharge(event.data.object);
                </div>
                <div className="mt-2 border-l-2 border-[#10B981] bg-[#10B981]/10 px-2 text-[#6EE7B7]">
                  + const payload = await req.text();
                </div>
                <div className="border-l-2 border-[#10B981] bg-[#10B981]/10 px-2 text-[#6EE7B7]">
                  + const event = StripeEvent.parse(verifySignature(payload));
                </div>
                <div className="border-l-2 border-[#10B981] bg-[#10B981]/10 px-2 text-[#6EE7B7]">
                  + await applyCharge(ChargeSchema.parse(event.data.object));
                </div>
              </pre>
            </div>
            <div className="mt-6 flex flex-wrap justify-between gap-3 border-t border-white/10 pt-4 font-mono text-[11px] text-[#71717a]">
              <span>AST PARSE: 38ms</span>
              <span>SANDBOX CHECK: PASSED</span>
              <span>0 FALSE POSITIVES</span>
            </div>
          </div>
        </section>

        <section id="architecture" className="relative grid scroll-mt-14 grid-cols-1 border-b border-white/10 md:grid-cols-12">
          <CornerMarks />
          <article id="ast" className="scroll-mt-14 border-b border-white/10 p-8 md:col-span-7 md:border-r md:p-10">
            <p className="font-mono text-[11px] tracking-[0.14em] text-[#71717a]">01 // AST</p>
            <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em]">
              Deep Next.js and TypeScript AST analysis
            </h2>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-[#a1a1aa]">
              Provix parses the abstract syntax tree across Server Actions, route handlers, and
              middleware. Regex linters miss the path from an untyped request into a database write.
              The tree does not.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-2 font-mono text-[11px]">
              <span className="border border-white/10 bg-[#18181B] px-2 py-1 text-[#ededed]">Server Action</span>
              <span className="text-[#71717a]">──&gt;</span>
              <span className="border border-[#EF4444]/50 bg-[#EF4444]/10 px-2 py-1 text-[#FCA5A5]">Unvalidated Param</span>
              <span className="text-[#71717a]">──&gt;</span>
              <span className="border border-[#7c3aed]/40 bg-[#18181B] px-2 py-1 text-[#7c3aed]">Supabase Mutation</span>
            </div>
          </article>

          <article className="border-b border-white/10 p-8 md:col-span-5 md:p-10">
            <p className="font-mono text-[11px] tracking-[0.14em] text-[#71717a]">02 // HEAL</p>
            <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em]">
              Autonomous PR healing
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-[#a1a1aa]">
              A scanner that dumps fifty warnings still leaves the patch to you. Provix writes the
              TypeScript diff, checks it in a sandbox, and leaves a commit you can land in one click.
            </p>
            <div className="mt-8 border border-white/10 bg-[#0a0a0a]">
              <div className="flex items-center justify-between border-b border-white/10 px-3 py-2 font-mono text-[10px] text-[#71717a]">
                <span>provix-bot</span>
                <span>pull request comment</span>
              </div>
              <div className="p-3">
                <p className="text-xs leading-relaxed text-[#a1a1aa]">
                  Signature check and Zod parse are ready. Sandbox reports no new type errors.
                </p>
                <Link
                  href="/onboarding"
                  prefetch={false}
                  className="mt-3 inline-flex rounded-[4px] bg-[#7c3aed] px-2.5 py-1.5 font-mono text-[11px] text-white transition hover:bg-[#6d28d9]"
                >
                  [Commit Provix Patch]
                </Link>
              </div>
            </div>
          </article>

          <article id="security" className="scroll-mt-14 border-b border-white/10 p-8 md:col-span-5 md:border-r md:border-b-0 md:p-10">
            <p className="font-mono text-[11px] tracking-[0.14em] text-[#71717a]">03 // ACCESS</p>
            <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em]">
              Dual zero-trust onboarding
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-[#a1a1aa]">
              Connect the GitHub App for webhook automation, or scan with a fine-grained personal
              access token when you do not want a full OAuth install.
            </p>
            <div className="mt-6 grid grid-cols-1 border border-white/10 sm:grid-cols-2">
              <div className="border-b border-white/10 p-4 sm:border-r sm:border-b-0">
                <p className="font-mono text-[10px] text-[#7c3aed]">MODE 01</p>
                <p className="mt-2 text-sm text-[#ededed]">GitHub App</p>
                <p className="mt-2 text-xs leading-relaxed text-[#a1a1aa]">
                  One install. Every pull request is intercepted by webhook.
                </p>
              </div>
              <div className="p-4">
                <p className="font-mono text-[10px] text-[#71717a]">MODE 02</p>
                <p className="mt-2 text-sm text-[#ededed]">Scoped token</p>
                <p className="mt-2 text-xs leading-relaxed text-[#a1a1aa]">
                  A fine-grained PAT. No full GitHub OAuth link required.
                </p>
              </div>
            </div>
          </article>

          <article className="p-8 md:col-span-7 md:p-10">
            <p className="font-mono text-[11px] tracking-[0.14em] text-[#71717a]">04 // SANDBOX</p>
            <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em]">
              Zero-noise sandbox verification
            </h2>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-[#a1a1aa]">
              Provix type-checks its own patch against your tsconfig and project types before the
              diff is offered. Broken builds and invented imports stay off the pull request.
            </p>
            <ol className="mt-8 border border-white/10 font-mono text-[11px]">
              <li className="flex items-center justify-between border-b border-white/10 px-3 py-2 text-[#a1a1aa]">
                <span>load tsconfig.json</span>
                <span className="text-[#10B981]">OK</span>
              </li>
              <li className="flex items-center justify-between border-b border-white/10 px-3 py-2 text-[#a1a1aa]">
                <span>resolve project types</span>
                <span className="text-[#10B981]">OK</span>
              </li>
              <li className="flex items-center justify-between px-3 py-2 text-[#a1a1aa]">
                <span>reject hallucinated imports</span>
                <span className="text-[#10B981]">0</span>
              </li>
            </ol>
          </article>
        </section>

        <section aria-labelledby="execute-heading" className="border-b border-white/10">
          <div className="border-b border-white/10 px-8 py-6 md:px-10">
            <p className="font-mono text-[11px] tracking-[0.14em] text-[#71717a]">05 // RUNNER</p>
            <h2 id="execute-heading" className="mt-2 text-2xl font-semibold tracking-[-0.03em]">
              How Provix executes
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 md:divide-x md:divide-white/10">
            <article className="border-b border-white/10 p-8 md:border-b-0 md:p-10">
              <p className="font-mono text-[11px] text-[#7c3aed]">01 // INTERCEPT</p>
              <p className="mt-4 text-sm leading-relaxed text-[#a1a1aa]">
                Triggered by a GitHub pull request webhook, or by a manual scan with a scoped token.
              </p>
            </article>
            <article className="border-b border-white/10 p-8 md:border-b-0 md:p-10">
              <p className="font-mono text-[11px] text-[#7c3aed]">02 // PARSE & HEAL</p>
              <p className="mt-4 text-sm leading-relaxed text-[#a1a1aa]">
                The AST engine isolates the security and type flaw, then synthesizes a minimal diff.
              </p>
            </article>
            <article className="p-8 md:p-10">
              <p className="font-mono text-[11px] text-[#7c3aed]">03 // VERIFY & MERGE</p>
              <p className="mt-4 text-sm leading-relaxed text-[#a1a1aa]">
                The patch is type-checked in an isolated sandbox and posted on your pull request.
              </p>
            </article>
          </div>
        </section>

        <footer className="px-8 py-12 md:px-10">
          <h2 className="max-w-xl text-3xl font-semibold tracking-[-0.04em] md:text-4xl">
            Harden your Next.js codebase today.
          </h2>
          <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <ConnectRepositoryButton label="Install GitHub App [->]" className={primaryButton} />
            <Link href="/onboarding" prefetch={false} className={tokenButton}>
              Use Access Token
            </Link>
          </div>
          <div className="mt-12 flex flex-col gap-4 border-t border-white/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="font-mono text-[11px] tracking-[0.12em] text-[#71717a]">
              SYSTEM STATUS: OPERATIONAL // GETPROVIX.COM
            </p>
            <div className="flex items-center gap-5 font-mono text-[11px] tracking-[0.12em] text-[#71717a]">
              <Link href="/privacy" prefetch={false} className="transition hover:text-[#ededed]">
                Privacy
              </Link>
              <Link href="/terms" prefetch={false} className="transition hover:text-[#ededed]">
                Terms
              </Link>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
