"use client";

import type { TalentPoolOnboardingStatus } from "@/lib/published-candidate-profile";

type TalentNetworkStatusBannerProps = {
  status: TalentPoolOnboardingStatus;
};

function StepRow({
  met,
  label,
  detail,
}: {
  met: boolean;
  label: string;
  detail?: string | null;
}) {
  return (
    <li className="flex items-start gap-2.5 text-sm">
      <span
        aria-hidden
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
          met
            ? "bg-emerald-500/20 text-emerald-400"
            : "bg-zinc-800 text-zinc-500"
        }`}
      >
        {met ? "✓" : "·"}
      </span>
      <span className="min-w-0">
        <span
          className={
            met ? "font-medium text-zinc-200" : "font-medium text-zinc-400"
          }
        >
          {label}
        </span>
        {detail ? (
          <span className="mt-0.5 block text-xs text-zinc-500">{detail}</span>
        ) : null}
      </span>
    </li>
  );
}

export default function TalentNetworkStatusBanner({
  status,
}: TalentNetworkStatusBannerProps) {
  if (status.isVisibleInPool) {
    return (
      <div
        role="status"
        className="mb-6 flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3"
      >
        <span className="inline-flex items-center rounded-full bg-emerald-500/20 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-emerald-300">
          Live
        </span>
        <p className="text-sm font-semibold text-emerald-100">
          Live in Talent Network (Visible to Employers)
        </p>
      </div>
    );
  }

  const scoreDetail =
    typeof status.auditScore === "number"
      ? `Current score: ${Math.round(status.auditScore)}/100`
      : "No verified audit score yet";

  const profileDetail =
    status.missingFieldLabels.length > 0
      ? `Missing: ${status.missingFieldLabels.join(", ")}`
      : null;

  return (
    <div
      role="status"
      className="mb-6 rounded-xl border border-border bg-panel/80 px-4 py-4"
    >
      <p className="text-sm font-bold text-textMain">
        Steps to get featured in the Talent Network
      </p>
      <ul className="mt-3 space-y-2.5">
        <StepRow
          met={status.scoreMet}
          label="Audit Score ≥ 75"
          detail={scoreDetail}
        />
        <StepRow
          met={status.githubVerified}
          label="GitHub Ownership Verified"
          detail={
            status.githubVerified
              ? "GitHub identity linked"
              : "Connect GitHub to verify ownership"
          }
        />
        <StepRow
          met={status.profileDetailsComplete}
          label="Profile Details Completed"
          detail={profileDetail}
        />
      </ul>
    </div>
  );
}
