import { Crosshair } from "lucide-react";

export default function HiringInterviewBattlePlan({
  probes,
}: {
  probes: [string, string];
}) {
  return (
    <section
      className="rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-5 sm:p-6"
      aria-labelledby="battle-plan-heading"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-300">
          <Crosshair className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <h3
            id="battle-plan-heading"
            className="text-base font-bold tracking-tight text-zinc-50"
          >
            Hiring Team Interview Battle Plan
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-zinc-400">
            Two technical challenges derived from the weakest Testing and
            Resilience signals — use these to probe real liability in the
            codebase.
          </p>
        </div>
      </div>
      <ol className="mt-4 list-none space-y-3">
        {probes.map((probe, index) => (
          <li
            key={index}
            className="flex items-start gap-3 rounded-lg border border-zinc-800/80 bg-zinc-950/70 px-3 py-3"
          >
            <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-amber-500/30 bg-amber-500/10 font-mono text-[11px] font-bold text-amber-200">
              {index + 1}
            </span>
            <p className="min-w-0 flex-1 text-sm leading-relaxed text-zinc-200">
              {probe}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}
