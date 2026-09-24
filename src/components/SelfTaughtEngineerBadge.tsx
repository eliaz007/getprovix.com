import { cn } from "@/lib/cn";
import { SELF_TAUGHT_ENGINEER_LABEL } from "@/lib/candidate-education";

type SelfTaughtEngineerBadgeProps = {
  className?: string;
};

export default function SelfTaughtEngineerBadge({
  className,
}: SelfTaughtEngineerBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-zinc-700 bg-zinc-900/80 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-zinc-200",
        className
      )}
    >
      {SELF_TAUGHT_ENGINEER_LABEL}
    </span>
  );
}
