import type { BlastRadiusRow, BlastRiskLevel } from "@/lib/forensic-dossier";

function riskClass(level: BlastRiskLevel): string {
  if (level === "P1") {
    return "border-rose-500/40 bg-rose-500/15 text-rose-300";
  }
  if (level === "P2") {
    return "border-amber-500/40 bg-amber-500/10 text-amber-200";
  }
  return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
}

export default function SubsystemBlastRadiusMatrix({
  rows,
}: {
  rows: BlastRadiusRow[];
}) {
  return (
    <section
      className="mt-2 w-full overflow-hidden rounded-xl border border-zinc-700/70 bg-zinc-950 shadow-[0_0_0_1px_rgba(255,255,255,0.03)]"
      aria-labelledby="blast-radius-heading"
    >
      <div className="border-b border-zinc-800/80 px-4 py-4 sm:px-5">
        <h3
          id="blast-radius-heading"
          className="text-sm font-semibold tracking-tight text-zinc-100"
        >
          Codebase Breakdown
        </h3>
        <p className="mt-1.5 text-xs leading-relaxed text-zinc-500">
          Overview of code quality, risks, and ownership readiness by area.
        </p>
      </div>
      <div className="w-full overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-900/80 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
              <th className="px-4 py-2.5 font-medium sm:px-5">Area</th>
              <th className="px-4 py-2.5 font-medium sm:px-5">
                Can They Own This?
              </th>
              <th className="px-4 py-2.5 font-medium sm:px-5">Risk</th>
              <th className="px-4 py-2.5 font-medium sm:px-5">
                What We Found
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.subsystem}
                className="border-b border-zinc-800/60 last:border-0"
              >
                <td className="px-4 py-3 font-mono text-xs font-semibold text-zinc-100 sm:px-5">
                  {row.subsystem}
                </td>
                <td className="px-4 py-3 text-xs text-zinc-300 sm:px-5">
                  {row.evaluatedSeniority}
                </td>
                <td className="px-4 py-3 sm:px-5">
                  <span
                    className={`inline-flex rounded border px-2 py-0.5 font-mono text-[11px] font-semibold ${riskClass(
                      row.riskLevel
                    )}`}
                  >
                    {row.riskLevel}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs leading-relaxed text-zinc-400 sm:px-5">
                  {row.forensicFinding}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
