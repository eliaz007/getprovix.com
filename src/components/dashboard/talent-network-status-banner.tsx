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
  if (status.isLiveOnRoster) {
    return (
      <div
        role="status"
        className="mb-6 flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3"
      >
        <span className="inline-flex items-center rounded-full bg-emerald-500/20 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-emerald-300">
          Live
        </span>
        <p className="text-sm font-semibold text-emerald-100">
          {status.isContractOnlyLive
            ? "Live • Contract Sprints Only"
            : "Live on Roster (Network-Visible to Employers)"}
        </p>
      </div>
    );
  }

  if (status.needsContractPlacementDetails) {
    return (
      <div
        role="status"
        className="mb-6 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3"
      >
        <span className="mt-0.5 inline-flex shrink-0 items-center rounded-full bg-amber-500/20 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-amber-200">
          Action Needed
        </span>
        <p className="text-sm font-medium leading-snug text-amber-100/95">
          Action Needed — Set your weekly bandwidth and target rate below to
          activate contract placement.
        </p>
      </div>
    );
  }

  // Visible toggle on, but no Full-Time / Contract preference selected.
  if (status.isVisibleInPool && !status.hasEngagementMode) {
    return (
      <div
        role="status"
        className="mb-6 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3"
      >
        <span className="mt-0.5 inline-flex shrink-0 items-center rounded-full bg-amber-500/20 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-amber-200">
          Inactive
        </span>
        <p className="text-sm font-medium leading-snug text-amber-100/95">
          Inactive — Select at least one work preference (Full-Time or Contract)
          to appear in employer searches.
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
        <StepRow
          met={status.hasEngagementMode}
          label="Work preference selected"
          detail={
            status.hasEngagementMode
              ? "Full-Time and/or Contract enabled"
              : "Turn on Full-Time or Contract to appear in employer searches"
          }
        />
      </ul>
    </div>
  );
}
