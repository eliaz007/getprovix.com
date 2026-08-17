import { ShieldCheck } from "lucide-react";

type VerifiedOnProvixPillProps = {
  className?: string;
};

export default function VerifiedOnProvixPill({
  className = "",
}: VerifiedOnProvixPillProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-300 ${className}`}
    >
      <ShieldCheck className="h-3 w-3" aria-hidden />
      Verified on Provix
    </span>
  );
}
