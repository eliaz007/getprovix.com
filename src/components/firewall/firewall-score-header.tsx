import type { FirewallReport } from "@/lib/firewall-contract";

type ScoreTone = {
  label: string;
  stroke: string;
  text: string;
  chip: string;
};

function scoreTone(score: number): ScoreTone {
  if (score >= 80) {
    return {
      label: "Healthy",
      stroke: "#34d399",
      text: "text-emerald-300",
      chip: "bg-emerald-400/15 text-emerald-200 ring-emerald-400/30",
    };
  }
  if (score >= 50) {
    return {
      label: "Watch",
      stroke: "#fbbf24",
      text: "text-amber-300",
      chip: "bg-amber-400/15 text-amber-100 ring-amber-400/30",
    };
  }
  return {
    label: "Exposed",
    stroke: "#fb7185",
    text: "text-rose-300",
    chip: "bg-rose-400/15 text-rose-100 ring-rose-400/30",
  };
}

const METRICS = [
  { key: "criticalCount", label: "Critical Boundary Leaks", valueClass: "text-rose-300" },
  { key: "highCount", label: "Circular Dependencies", valueClass: "text-orange-300" },
  { key: "mediumCount", label: "Architectural Bloat", valueClass: "text-amber-200" },
  { key: "lowCount", label: "Dead Weight / Orphans", valueClass: "text-zinc-200" },
] as const;

function ScoreDial({ score }: { score: number }) {
  const tone = scoreTone(score);
  const clamped = Math.min(100, Math.max(0, score));
  const degrees = clamped * 3.6;

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        role="img"
        aria-label={`Architecture Health Score ${score} out of 100, ${tone.label}`}
        className="grid h-36 w-36 place-items-center rounded-full"
        style={{
          background: `conic-gradient(${tone.stroke} ${degrees}deg, rgba(255,255,255,0.08) ${degrees}deg)`,
        }}
      >
        <div className="grid h-28 w-28 place-items-center rounded-full bg-neutral-950">
          <div className="text-center">
            <p className={`text-4xl font-semibold tracking-tight tabular-nums ${tone.text}`}>{score}</p>
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">/ 100</p>
          </div>
        </div>
      </div>
      <span className={`rounded-md px-2.5 py-1 text-[11px] font-semibold ring-1 ${tone.chip}`}>{tone.label}</span>
    </div>
  );
}

export default function FirewallScoreHeader({
  report,
  title = "Local codebase firewall",
}: {
  report: FirewallReport;
  title?: string;
}) {
  const scannedAt = new Date(report.timestamp);
  const scannedLabel = Number.isNaN(scannedAt.getTime())
    ? report.timestamp
    : scannedAt.toLocaleString();

  return (
    <section className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-5 md:p-6">
      <div className="grid items-center gap-6 lg:grid-cols-[180px_minmax(0,1fr)] lg:gap-8">
        <ScoreDial score={report.architectureScore} />
        <div className="min-w-0">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                Architecture Health Score
              </p>
              <h2 className="mt-1 truncate text-xl font-semibold tracking-tight text-white md:text-2xl">
                {title}
              </h2>
            </div>
            <p className="font-mono text-[11px] text-zinc-500">
              {report.summary.totalFiles.toLocaleString("en-US")} files ·{" "}
              {report.summary.totalLines.toLocaleString("en-US")} lines · {scannedLabel}
            </p>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {METRICS.map((metric) => (
              <article
                key={metric.key}
                className="rounded-lg border border-neutral-800 bg-neutral-900/50 px-3.5 py-3"
              >
                <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-500">
                  {metric.label}
                </p>
                <p className={`mt-1 text-2xl font-semibold tracking-tight tabular-nums ${metric.valueClass}`}>
                  {report.summary[metric.key].toLocaleString("en-US")}
                </p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
