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
      className={`inline-flex items-center rounded-full border border-slate-700/80 bg-slate-900/70 px-2.5 py-1 text-[11px] font-medium text-slate-300 ${className}`}
    >
      {label}
    </span>
  );
}
