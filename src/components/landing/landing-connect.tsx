"use client";

import Link from "next/link";
import ConnectRepositoryButton from "@/components/onboarding/connect-repository-button";
import { HAPPY_PATH_STEPS } from "@/lib/product-copy";

const outlineClass =
  "inline-flex items-center rounded-md border border-white/10 bg-[#141414] px-6 py-3.5 text-sm font-mono text-[#ededed] transition-colors hover:bg-white/5";

export default function LandingConnect() {
  return (
    <section id="access" aria-labelledby="access-heading" className="scroll-mt-24 border-b border-white/10">
      <div className="px-6 py-12 sm:px-10">
        <p className="font-mono text-xs tracking-widest text-[#a1a1aa] uppercase">Access</p>
        <h2 id="access-heading" className="mt-3 max-w-2xl text-3xl font-medium tracking-[-0.03em] text-[#ededed] sm:text-4xl">
          Install the GitHub App, or scan with a scoped token.
        </h2>
        <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-[#a1a1aa]">
          Takes about two minutes: sign in, install the app, pick a repo, run the first scan.
        </p>
      </div>

      <div className="grid grid-cols-1 divide-y divide-white/10 border-t border-white/10 md:grid-cols-2 md:divide-x md:divide-y-0">
        <article className="bg-[#141414] px-6 py-8 sm:px-10">
          <p className="font-mono text-[11px] tracking-widest text-[#c4b5fd] uppercase">Option A</p>
          <h3 className="mt-3 text-xl font-medium tracking-[-0.03em] text-[#ededed]">1-click GitHub App</h3>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-[#a1a1aa]">
            Sign in so Provix can install its GitHub App on your account, then open fix pull requests from the scan.
          </p>
          <div className="mt-6">
            <ConnectRepositoryButton label="Connect GitHub" variant="editorial" />
          </div>
        </article>

        <article className="bg-[#18181B] px-6 py-8 sm:px-10">
          <p className="font-mono text-[11px] tracking-widest text-[#c4b5fd] uppercase">Option B</p>
          <h3 className="mt-3 text-xl font-medium tracking-[-0.03em] text-[#ededed]">Scoped access token</h3>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-[#a1a1aa]">
            Sign in, open the firewall, and paste a repository URL to scan with a token instead of installing the App.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/onboarding" prefetch={false} className={outlineClass}>
              Sign in
            </Link>
            <Link href="/onboarding" className={outlineClass}>
              Open firewall
            </Link>
          </div>
        </article>
      </div>

      <ol className="grid grid-cols-1 divide-y divide-white/10 border-t border-white/10 md:grid-cols-3 md:divide-x md:divide-y-0" aria-label="How Provix works">
        {HAPPY_PATH_STEPS.map((item) => (
          <li key={item.step} className="bg-[#141414] px-6 py-6 sm:px-10">
            <p className="font-mono text-[11px] tracking-widest text-[#a1a1aa] uppercase">Step {item.step}</p>
            <p className="mt-3 text-sm font-medium tracking-[-0.03em] text-[#ededed]">{item.title}</p>
            <p className="mt-2 text-[13px] leading-relaxed text-[#a1a1aa]">{item.detail}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
