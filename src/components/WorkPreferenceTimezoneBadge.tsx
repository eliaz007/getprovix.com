import { formatWorkPreferenceTimezoneBadge } from "@/lib/work-preference";

type WorkPreferenceTimezoneBadgeProps = {
  workPreference?: string | null;
  timezone?: string | null;
  className?: string;
};

export default function WorkPreferenceTimezoneBadge({
  workPreference,
  timezone,
  className = "",
}: WorkPreferenceTimezoneBadgeProps) {
  const label = formatWorkPreferenceTimezoneBadge(workPreference, timezone);

  return (
    <span
      className={`inline-flex items-center rounded-md border border-zinc-800 bg-zinc-950 px-2.5 py-1 font-mono text-[11px] text-zinc-400 ${className}`}
    >
      {label}
    </span>
  );
}
