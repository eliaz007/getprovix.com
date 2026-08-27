import { ShieldCheck } from "lucide-react";

type VerifiedOnProvixPillProps = {
  className?: string;
};

export default function VerifiedOnProvixPill({
  className = "",
}: VerifiedOnProvixPillProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border border-zinc-800 bg-zinc-950 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-zinc-400 ${className}`}
    >
      <ShieldCheck className="h-3 w-3" aria-hidden />
      Verified on Provix
    </span>
  );
}
