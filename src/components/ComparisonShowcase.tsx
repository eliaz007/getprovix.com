"use client";

const monoLabel =
  "font-mono text-[11px] uppercase tracking-[0.22em] text-zinc-500";

const cardShell =
  "rounded-xl border border-white/10 bg-zinc-950/80 shadow-[0_0_0_1px_rgba(139,92,246,0.08)]";

type Row = {
  dimension: string;
  provix: string;
  scanners: string;
  bots: string;
};

const ROWS: Row[] = [
  {
    dimension: "What you get",
    provix: "A Pull Request with the fix written in",
    scanners: "A long list of warnings to dig through",
    bots: "Chat comments or suggested snippets",
  },
  {
    dimension: "Noise",
    provix: "Rules tuned for Next.js and Supabase",
    scanners: "Lots of generic alerts that waste review time",
    bots: "Guessy notes that miss framework details",
  },
  {
    dimension: "Build safety",
    provix: "Patch must pass tsc --noEmit before the PR opens",
    scanners: "No check that a fix would even compile",
    bots: "Suggestions can invent bad imports or types",
  },
  {
    dimension: "Who merges",
    provix: "You. Provix never merges for you",
    scanners: "You still rewrite the code yourself",
    bots: "You still copy, paste, and clean up",
  },
];

export default function ComparisonShowcase() {
  return (
    <section
      id="compare"
      aria-labelledby="compare-heading"
      className="scroll-mt-16 border-t border-white/10 py-14"
    >
      <div className="mb-6 max-w-3xl">
        <p className={monoLabel}>Why Provix</p>
        <h2
          id="compare-heading"
          className="mt-3 text-2xl font-extrabold tracking-tight text-white sm:text-3xl"
        >
          Provix vs. other tools
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-zinc-400">
          Most tools dump noisy warnings or leave unverified suggestions. Provix
          opens a real PR that already passed{" "}
          <span className="font-mono text-zinc-300">tsc</span>.
        </p>
      </div>

      <div className={`${cardShell} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="min-w-[680px] w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-white/10 bg-black/40">
                <th className="px-4 py-3.5 text-xs font-medium text-zinc-500 sm:px-5">
                  &nbsp;
                </th>
                <th className="px-4 py-3.5 text-xs font-semibold text-white sm:px-5">
                  Provix
                </th>
                <th className="px-4 py-3.5 text-xs font-medium text-zinc-500 sm:px-5">
                  Legacy scanners
                </th>
                <th className="px-4 py-3.5 text-xs font-medium text-zinc-500 sm:px-5">
                  AI review bots
                </th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr
                  key={row.dimension}
                  className="border-b border-white/5 last:border-b-0"
                >
                  <th
                    scope="row"
                    className="align-top px-4 py-4 text-sm font-semibold text-zinc-200 sm:px-5"
                  >
                    {row.dimension}
                  </th>
                  <td className="align-top px-4 py-4 text-sm leading-relaxed text-emerald-200/95 sm:px-5">
                    {row.provix}
                  </td>
                  <td className="align-top px-4 py-4 text-sm leading-relaxed text-zinc-500 sm:px-5">
                    {row.scanners}
                  </td>
                  <td className="align-top px-4 py-4 text-sm leading-relaxed text-zinc-500 sm:px-5">
                    {row.bots}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
