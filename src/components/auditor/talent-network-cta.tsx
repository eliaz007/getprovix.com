import Link from "next/link";

const CAPABILITIES = [
  "[ Deep Code Insights ]",
  "[ Continuous Score Tracking ]",
  "[ Founder Inbound ]",
] as const;

export default function TalentNetworkCta() {
  return (
    <div className="relative mt-8 overflow-hidden rounded-2xl border border-neutral-800 bg-[#0d0f17] p-8">
      <div className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-violet-600/5 blur-3xl" />
      <div className="relative">
        <span className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2.5 py-0.5 font-mono text-xs text-cyan-400">
          <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
          // BUILDER ACCESS
        </span>
        <h3 className="text-2xl font-bold leading-snug tracking-tight text-white sm:text-3xl">
          Create an account to unlock code insights and connect with founders.
        </h3>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-neutral-400">
          Save your audit history, track scores as you resolve flagged issues,
          and allow engineering leads to discover your work based on real code.
        </p>
        <div className="flex flex-wrap items-center gap-2 py-4">
          {CAPABILITIES.map((label) => (
            <span
              key={label}
              className="rounded-md border border-neutral-800 bg-neutral-900/90 px-3 py-1.5 font-mono text-xs text-neutral-300"
            >
              {label}
            </span>
          ))}
        </div>
        <div>
          <Link
            href="/login?role=developer"
            className="inline-flex items-center justify-center rounded-lg bg-violet-600 px-6 py-2.5 text-sm font-medium text-white shadow-[0_0_20px_rgba(124,58,237,0.3)] transition-all hover:bg-violet-500"
          >
            Create Free Account →
          </Link>
          <p className="mt-2 text-xs text-neutral-500">
            Free forever • Takes 10 seconds
          </p>
        </div>
      </div>
    </div>
  );
}
