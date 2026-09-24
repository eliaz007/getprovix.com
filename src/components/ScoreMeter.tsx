import { clampScore0to100, scoreBarWidthPercent } from "@/lib/score-scale";

type ScoreMeterProps = {
  score: number;
  className?: string;
};

export default function ScoreMeter({ score, className = "" }: ScoreMeterProps) {
  const clamped = clampScore0to100(score);
  const fillTone =
    clamped >= 75
      ? "bg-violet-400"
      : clamped >= 60
        ? "bg-violet-500/70"
        : "bg-zinc-600";

  return (
    <div
      className={`mt-4 h-2 w-full overflow-hidden rounded-full border border-zinc-800/80 bg-zinc-900/80 ${className}`.trim()}
      role="progressbar"
      aria-label="Score out of 100"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={`h-full rounded-full transition-all duration-300 ${fillTone}`}
        style={{ width: scoreBarWidthPercent(clamped) }}
      />
    </div>
  );
}
