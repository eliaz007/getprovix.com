"use client";

import ConnectRepositoryButton from "@/components/onboarding/connect-repository-button";
import { HAPPY_PATH_STEPS } from "@/lib/product-copy";

export default function LandingConnect() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
        <ConnectRepositoryButton label="Connect GitHub" />
        <p className="max-w-sm text-sm leading-relaxed text-[#f9fafb]/55">
          Takes about two minutes: sign in, install the app, pick a repo, run the first scan.
        </p>
      </div>

      <ol className="grid gap-4 sm:grid-cols-3" aria-label="How Provix works">
        {HAPPY_PATH_STEPS.map((item) => (
          <li
            key={item.step}
            className="rounded-xl border border-white/10 bg-black/40 px-4 py-4 backdrop-blur-sm"
          >
            <p className="font-mono text-[11px] tracking-[0.18em] text-purple-400 uppercase">
              Step {item.step}
            </p>
            <p className="mt-2 text-sm font-semibold tracking-tight text-[#f9fafb]">
              {item.title}
            </p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-[#f9fafb]/60">
              {item.detail}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}
