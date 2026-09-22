import Link from "next/link";

const CAPABILITIES = [
  "[ Deep Code Insights ]",
  "[ Continuous Score Tracking ]",
  "[ Founder Inbound ]",
] as const;

export default function TalentNetworkCta() {
  return (
    <div className="relative mt-8 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#131316]/85 p-8 shadow-2xl backdrop-blur-xl">
      <div className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-amber-500/[0.06] blur-3xl" />
      <div className="relative">
        <span className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-amber-500/25 bg-amber-500/10 px-2.5 py-0.5 font-mono text-xs text-amber-300">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
          // BUILDER ACCESS
        </span>
        <h3 className="text-2xl font-bold leading-snug tracking-tight text-white sm:text-3xl">
          Create an account to unlock code insights and connect with founders.
        </h3>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-zinc-400">
          Save your audit history, track scores as you resolve flagged issues,
          and allow engineering leads to discover your work based on real code.
        </p>
        <div className="flex flex-wrap items-center gap-2 py-4">
          {CAPABILITIES.map((label) => (
            <span
              key={label}
              className="rounded-md border border-white/[0.07] bg-[#1A1A1E] px-3 py-1.5 font-mono text-xs text-zinc-300"
            >
              {label}
            </span>
          ))}
        </div>
        <div>
          <Link
            href="/login?role=developer"
            className="inline-flex items-center justify-center rounded-lg bg-[#F4F4F6] px-6 py-2.5 text-sm font-semibold text-[#0B0B0D] shadow-sm transition-all hover:bg-white"
          >
            Create Free Account →
          </Link>
          <p className="mt-2 text-xs text-zinc-500">
            Free forever • Takes 10 seconds
          </p>
        </div>
      </div>
    </div>
  );
}
