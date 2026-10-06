import { ShieldCheck } from "lucide-react";
import {
  isVerifiedOnProvix,
  type PublishedCandidateProfileRow,
} from "@/lib/published-candidate-profile";
import { PUBLIC_SCORECARD_THRESHOLD } from "@/lib/production-audit";

type VerifiedOnProvixBadgeProps = {
  className?: string;
  verified?: boolean;
  profile?: PublishedCandidateProfileRow | null;
};

/**
 * Renders only when github_verified and production score ≥ 75.
 * Otherwise returns null — no fallback / warning badges.
 */
export default function VerifiedOnProvixPill({
  className = "",
  verified,
  profile,
}: VerifiedOnProvixBadgeProps) {
  const show =
    verified === true ||
    (verified !== false && profile !== undefined && isVerifiedOnProvix(profile));

  if (!show) {
    return null;
  }

  return (
    <span
      title={`Linked GitHub and a ${PUBLIC_SCORECARD_THRESHOLD}+ production audit score`}
      className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-emerald-300 ${className}`}
    >
      <ShieldCheck className="h-3 w-3" aria-hidden />
      Verified on Provix
    </span>
  );
}
