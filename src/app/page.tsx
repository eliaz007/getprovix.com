import Link from "next/link";
import { ProvixLogo } from "@/components/ProvixLogo";
import ConnectRepositoryButton from "@/components/onboarding/connect-repository-button";
import { buildPageMetadata, SITE_DESCRIPTION } from "@/lib/site";

export const dynamic = "force-static";
export const revalidate = false;

export const metadata = buildPageMetadata(
  "Automated Security for Next.js & Supabase",
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

        <section className="grid gap-8 py-12 lg:grid-cols-12 lg:gap-10 lg:py-16">
          <div className="min-w-0 lg:col-span-7">
            <p className={`${monoLabel} inline-flex items-center gap-2`}>
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-violet-400" />
              Autonomous AST security &amp; type healing
            </p>
            <h1 className="mt-5 max-w-xl text-4xl font-extrabold tracking-tight text-white md:text-5xl lg:text-6xl">
              Catch and heal Next.js vulnerabilities before the PR merges.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-zinc-400 md:text-lg">
              Stop just flagging bad code and start auto-healing it. Provix catches leaked secrets,
              exposed client-side Supabase queries, and architectural bloat in Next.js and TypeScript
              repos, then opens a type-checked Pull Request to fix them automatically.
            </p>
            <div className="mt-10 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
              <ConnectRepositoryButton
                label="Install GitHub App [->]"
                className={primaryButton}
              />
              <Link href="/onboarding" prefetch={false} className={tokenButton}>
                Use Access Token
              </Link>
            </div>
          </div>

          <div className="min-w-0 lg:col-span-5">
            <div className={`${cardShell} overflow-hidden`}>
              <div className="flex items-center justify-between gap-3 border-b border-white/5 px-4 py-3">
                <p className="truncate font-mono text-[11px] text-zinc-500">
                  PR #204 · app/api/webhooks/stripe/route.ts
                </p>
                <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-violet-300">
                  AST patch ready
                </span>
              </div>
              <pre className="overflow-x-auto p-4 font-mono text-xs leading-6">
                <div className="rounded-md border-l-2 border-rose-500 bg-rose-500/10 px-2 text-rose-300">
                  - const event = req.body as any;
                </div>
                <div className="rounded-md border-l-2 border-rose-500 bg-rose-500/10 px-2 text-rose-300">
                  - await applyCharge(event.data.object);
                </div>
                <div className="mt-2 rounded-md border-l-2 border-emerald-500 bg-emerald-500/10 px-2 text-emerald-300">
                  + const payload = await req.text();
                </div>
                <div className="rounded-md border-l-2 border-emerald-500 bg-emerald-500/10 px-2 text-emerald-300">
                  + const event = StripeEvent.parse(verifySignature(payload));
                </div>
                <div className="rounded-md border-l-2 border-emerald-500 bg-emerald-500/10 px-2 text-emerald-300">
                  + await applyCharge(ChargeSchema.parse(event.data.object));
                </div>
              </pre>
              <div className="flex flex-wrap justify-between gap-3 border-t border-white/5 px-4 py-3 font-mono text-[11px] text-zinc-500">
                <span>AST PARSE: 38ms</span>
                <span className="text-emerald-400">SANDBOX CHECK: PASSED</span>
                <span>0 FALSE POSITIVES</span>
              </div>
            </div>
          </div>
        </section>

        <section
          id="architecture"
          className="scroll-mt-16 grid grid-cols-1 gap-4 border-t border-white/10 py-12 lg:grid-cols-12 lg:gap-5"
        >
          <article
            id="ast"
            className={`${cardShell} min-w-0 scroll-mt-16 p-6 sm:p-8 lg:col-span-7`}
          >
            <p className={monoLabel}>AST Engine</p>
            <h2 className="mt-3 text-2xl font-extrabold tracking-tight text-white">
              Deep Next.js and TypeScript AST analysis
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-zinc-400">
              Provix parses the abstract syntax tree across Server Actions, route handlers, and
              middleware. Regex linters miss the path from an untyped request into a database write.
              The tree does not.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-2 font-mono text-[11px]">
              <span className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-zinc-200">
                Server Action
              </span>
              <span className="text-zinc-600">──&gt;</span>
              <span className="rounded-md border border-rose-500/40 bg-rose-500/10 px-2 py-1 text-rose-300">
                Unvalidated Param
              </span>
              <span className="text-zinc-600">──&gt;</span>
              <span className="rounded-md border border-violet-400/30 bg-violet-500/10 px-2 py-1 text-violet-300">
                Supabase Mutation
              </span>
            </div>
          </article>

          <article className={`${cardShell} min-w-0 p-6 sm:p-8 lg:col-span-5`}>
            <p className={monoLabel}>Auto Heal</p>
            <h2 className="mt-3 text-2xl font-extrabold tracking-tight text-white">
              Autonomous PR healing
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-zinc-400">
              When a push or pull request triggers a check, Provix runs deterministic AST analysis to
              catch hardcoded API keys (OpenAI, Stripe, AWS, Supabase), client-side database exposure,
              vulnerable dependencies, and oversized files. Instead of just dropping a warning, Provix
              generates the code patch, falls back to a bounded Gemini retry loop for complex shapes,
              verifies the fix against tsc --noEmit, and opens a clean provix/auto-heal-* Pull Request
              ready for review. Anything that cannot pass strict compiler verification safely falls
              back to manual review.
            </p>
            <div className="mt-8 overflow-hidden rounded-xl border border-white/10 bg-black/40">
              <div className="flex items-center justify-between border-b border-white/5 px-3 py-2 font-mono text-[10px] text-zinc-500">
                <span>provix-bot</span>
                <span>pull request comment</span>
              </div>
              <div className="p-3">
                <p className="text-xs leading-relaxed text-zinc-400">
                  Signature check and Zod parse are ready. Sandbox reports no new type errors.
                </p>
                <Link
                  href="/onboarding"
                  prefetch={false}
                  className="mt-3 inline-flex rounded-lg bg-white px-2.5 py-1.5 font-mono text-[11px] font-semibold text-black transition hover:bg-zinc-200"
                >
                  [Commit Provix Patch]
                </Link>
              </div>
            </div>
          </article>

          <article
            id="security"
            className={`${cardShell} min-w-0 scroll-mt-16 p-6 sm:p-8 lg:col-span-5`}
          >
            <p className={monoLabel}>Access</p>
            <h2 className="mt-3 text-2xl font-extrabold tracking-tight text-white">
              Dual zero-trust onboarding
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-zinc-400">
              Connect the GitHub App for webhook automation, or scan with a fine-grained personal
              access token when you do not want a full OAuth install.
            </p>
            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-violet-300">
                  GitHub App
                </p>
                <p className="mt-2 text-xs leading-relaxed text-zinc-500">
                  One install. Every pull request is intercepted by webhook.
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                  Scoped token
                </p>
                <p className="mt-2 text-xs leading-relaxed text-zinc-500">
                  A fine-grained PAT. No full GitHub OAuth link required.
                </p>
              </div>
            </div>
          </article>

          <article className={`${cardShell} min-w-0 p-6 sm:p-8 lg:col-span-7`}>
            <p className={monoLabel}>Sandbox</p>
            <h2 className="mt-3 text-2xl font-extrabold tracking-tight text-white">
              Zero-noise sandbox verification
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-zinc-400">
              Provix type-checks its own patch against your tsconfig and project types before the
              diff is offered. Broken builds and invented imports stay off the pull request.
            </p>
            <ol className="mt-8 overflow-hidden rounded-xl border border-white/10 font-mono text-[11px]">
              <li className="flex items-center justify-between border-b border-white/5 px-3 py-2.5 text-zinc-400">
                <span>load tsconfig.json</span>
                <span className="text-emerald-400">OK</span>
              </li>
              <li className="flex items-center justify-between border-b border-white/5 px-3 py-2.5 text-zinc-400">
                <span>resolve project types</span>
                <span className="text-emerald-400">OK</span>
              </li>
              <li className="flex items-center justify-between px-3 py-2.5 text-zinc-400">
                <span>reject hallucinated imports</span>
                <span className="text-emerald-400">0</span>
              </li>
            </ol>
          </article>
        </section>

        <section
          aria-labelledby="execute-heading"
          className="border-t border-white/10 py-12"
        >
          <div className="mb-6">
            <p className={monoLabel}>Runner</p>
            <h2
              id="execute-heading"
              className="mt-3 text-2xl font-extrabold tracking-tight text-white"
            >
              How Provix executes
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <article className={`${cardShell} min-w-0 p-6 sm:p-8`}>
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-violet-300">
                Intercept
              </p>
              <p className="mt-4 text-sm leading-relaxed text-zinc-400">
                Triggered by a GitHub pull request webhook, or by a manual scan with a scoped token.
              </p>
            </article>
            <article className={`${cardShell} min-w-0 p-6 sm:p-8`}>
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-violet-300">
                Parse &amp; Heal
              </p>
              <p className="mt-4 text-sm leading-relaxed text-zinc-400">
                The AST engine isolates the security flaw or bloat, then synthesizes a minimal diff,
                falling back to a bounded Gemini retry loop for complex shapes.
              </p>
            </article>
            <article className={`${cardShell} min-w-0 p-6 sm:p-8`}>
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-violet-300">
                Verify &amp; Open PR
              </p>
              <p className="mt-4 text-sm leading-relaxed text-zinc-400">
                The patch passes tsc --noEmit and a sandbox check, then opens a provix/auto-heal-*
                pull request ready for review.
              </p>
            </article>
          </div>
        </section>

        <section
          id="trust"
          aria-labelledby="trust-heading"
          className="scroll-mt-16 border-t border-white/10 py-12"
        >
          <div className="mb-6 max-w-2xl">
            <p className={monoLabel}>Trust &amp; Privacy</p>
            <h2
              id="trust-heading"
              className="mt-3 text-2xl font-extrabold tracking-tight text-white"
            >
              What happens to your code?
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-zinc-400">
              Short answers before you connect a GitHub account or paste a token.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <article className={`${cardShell} min-w-0 p-6 sm:p-8`}>
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-emerald-400">
                Ephemeral reads
              </p>
              <p className="mt-4 text-sm leading-relaxed text-zinc-400">
                Provix reads repository files from GitHub for the scan or fix request. It does not
                keep a retained source tree of your private repo as a permanent archive.
              </p>
            </article>
            <article className={`${cardShell} min-w-0 p-6 sm:p-8`}>
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-emerald-400">
                No model training
              </p>
              <p className="mt-4 text-sm leading-relaxed text-zinc-400">
                Your private repository contents are not used to train foundation models. Scans and
                supported fixes run against the repo you connected for that request.
              </p>
            </article>
            <article className={`${cardShell} min-w-0 p-6 sm:p-8`}>
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-emerald-400">
                Scoped access
              </p>
              <p className="mt-4 text-sm leading-relaxed text-zinc-400">
                The GitHub App only sees repositories you select. A personal access token is used for
                that request. Details live in the{" "}
                <Link
                  href="/privacy"
                  prefetch={false}
                  className="text-zinc-200 underline-offset-2 hover:underline"
                >
                  Privacy Policy
                </Link>
                .
              </p>
            </article>
          </div>
        </section>

        <section
          id="about"
          aria-labelledby="about-heading"
          className="scroll-mt-16 border-t border-white/10 py-12"
        >
          <div className={`${cardShell} min-w-0 p-6 sm:p-8`}>
            <p className={monoLabel}>Who We Are</p>
            <h2
              id="about-heading"
              className="mt-3 max-w-2xl text-2xl font-extrabold tracking-tight text-white"
            >
              Built by a developer, for developers
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-zinc-400">
              Provix started as a solo build: one engineer tired of scanners that dump warnings and
              leave the patch to you. The product is still early, closed beta, and opinionated about
              Next.js and TypeScript. If you connect a repo, you get an honest autofix path with a
              human still owning the merge.
            </p>
          </div>
        </section>

        <footer className="border-t border-white/10 py-14">
          <h2 className="max-w-xl text-3xl font-extrabold tracking-tight text-white md:text-4xl">
            Harden your Next.js codebase today.
          </h2>
          <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <ConnectRepositoryButton
              label="Install GitHub App [->]"
              className={primaryButton}
            />
            <Link href="/onboarding" prefetch={false} className={tokenButton}>
              Use Access Token
            </Link>
          </div>
          <p className="mt-10 max-w-2xl text-sm leading-relaxed text-zinc-500">
            Built by a developer shipping in public — closed beta, TypeScript-first, merge still
            yours.
          </p>
          <div className="mt-8 flex flex-col gap-4 border-t border-white/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-500">
              System status: operational // getprovix.com
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
