import { clampScore0to100, scoreBarWidthPercent } from "@/lib/score-scale";

type ScoreMeterProps = {
  score: number;
  className?: string;
};

export default function ScoreMeter({ score, className = "" }: ScoreMeterProps) {
  const clamped = clampScore0to100(score);

  return (
    <div
      className={`h-1.5 w-full overflow-hidden rounded-full bg-black/40 ${className}`.trim()}
      role="progressbar"
      aria-label="Score out of 100"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full bg-current"
        style={{ width: scoreBarWidthPercent(clamped) }}
      />
    </div>
  );
}
