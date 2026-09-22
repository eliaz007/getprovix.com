import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { claimAuditLoginHref } from "@/lib/production-audit";

export default function ClaimScorecardCta() {
  return (
    <div className="rounded-2xl border border-border bg-panel p-5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-emerald-400">
          <ShieldCheck className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-textMain leading-relaxed">
            Claim this verified scorecard to attach it to your anonymous
            developer profile
          </p>
          <Link
            href={claimAuditLoginHref()}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md bg-brand text-white shadow-sm px-4 py-2.5 text-sm font-medium transition-colors hover:bg-brandHover"
          >
            Claim Scorecard & Join Roster
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </div>
    </div>
  );
}
