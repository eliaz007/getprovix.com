"use client";

import { useState } from "react";
import {
  BadgeCheck,
  FileSearch,
  FolderGit2,
  Loader2,
  Lock,
  Radar,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import DossierVerifiedCard from "@/components/auditor/dossier-verified-card";
import { fetchWithAuth } from "@/lib/fetch-with-auth";
import { readJsonResponse } from "@/lib/read-json-response";
import {
  cachePendingProductionAudit,
  canPublishProductionScore,
  type ProductionAuditClaim,
} from "@/lib/production-audit";
import { createClient } from "@/utils/supabase/client";

const DIAGNOSTIC_BULLETS = [
  {
    icon: FileSearch,
    title: "In-Depth Code Diagnostics",
    text: "Unlock file-by-file AST breakdowns of missing error handlers, untested edge cases, and CI pipeline failures.",
  },
  {
    icon: Wrench,
    title: "Automated Fix Blueprints",
    text: "Get ready-to-copy GitHub Action workflows, unit test mocks, and schema configurations tailored to this exact repo.",
  },
  {
    icon: Lock,
    title: "100% Private Sandbox",
    text: "Your score stays strictly private while you iterate. Re-scan on every commit with zero public paper trail until you cross 75.",
  },
] as const;

const VERIFIED_BULLETS = [
  {
    icon: Radar,
    text: "Direct founder inbound: Get discovered by hiring teams seeking vetted builders.",
  },
  {
    icon: BadgeCheck,
    text: "Public proof-of-work: Share a verified audit link highlighting your architecture and tests.",
  },
  {
    icon: FolderGit2,
    text: "Verified authorship: Link your GitHub account to confirm direct ownership of the commits.",
  },
] as const;

function CalloutBullet({
  icon: Icon,
  title,
  text,
}: {
  icon: LucideIcon;
  title?: string;
  text: string;
}) {
  return (
    <li className="flex items-start gap-3 text-sm leading-relaxed text-zinc-300">
      <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-white/10 bg-black/40 text-zinc-100">
        <Icon className="h-3.5 w-3.5" aria-hidden />
      </span>
      <span>
        {title ? (
          <span className="font-semibold text-zinc-100">{title}</span>
        ) : null}
        {title ? " — " : null}
        {text}
      </span>
    </li>
  );
}

export default function ScorecardPublicationCallout({
  claim,
  onRequireAuth,
}: {
  claim: ProductionAuditClaim;
  onRequireAuth?: (claim: ProductionAuditClaim) => void;
}) {
  const canPublish = canPublishProductionScore(claim.production_score);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle"
  );
  const [message, setMessage] = useState<string | null>(null);
  const [profileSlug, setProfileSlug] = useState<string | null>(null);
  const [published, setPublished] = useState(false);

  const persistOrSignUp = async (isPubliclyVisible: boolean) => {
    const nextClaim: ProductionAuditClaim = {
      ...claim,
      is_publicly_visible: isPubliclyVisible && canPublish,
    };

    setStatus("saving");
    setMessage(null);
    cachePendingProductionAudit(nextClaim);

    try {
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();

      if (!data.user) {
        setStatus("idle");
        onRequireAuth?.(nextClaim);
        return;
      }

      const response = await fetchWithAuth("/api/profile/production-audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextClaim),
      });
      const payload = await readJsonResponse<{
        error?: string;
        enrolled_in_talent_pool?: boolean;
        is_publicly_visible?: boolean;
        profile_slug?: string | null;
      }>(response);

      if (!response.ok) {
        throw new Error(payload.error ?? "Could not save this audit.");
      }

      setProfileSlug(
        typeof payload.profile_slug === "string"
          ? payload.profile_slug.trim() || null
          : null
      );
      setPublished(
        payload.enrolled_in_talent_pool === true ||
          payload.is_publicly_visible === true ||
          nextClaim.is_publicly_visible
      );
      setStatus("saved");
      setMessage(
        payload.enrolled_in_talent_pool === true || nextClaim.is_publicly_visible
          ? "Published to the talent roster. Founders can now request intros."
          : "Private diagnostic saved to your candidate dashboard."
      );
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error ? error.message : "Could not save this audit."
      );
    }
  };

  if (status === "saved" && published) {
    return <DossierVerifiedCard profileSlug={profileSlug} />;
  }

  const title = canPublish
    ? "Verified Pass — Founder Roster eligible (75+)"
    : "Private diagnostic — below the 75 roster bar";
  const subtitle = canPublish
    ? "This repository cleared Provix production standards. Publish it to the live Founder Roster so hiring teams can request intros."
    : "This dossier stays private. Resolve the operational deficits below, then re-submit for verification before it can appear on the Founder Roster.";
  const bullets = canPublish ? VERIFIED_BULLETS : DIAGNOSTIC_BULLETS;
  const buttonLabel = canPublish
    ? "Publish to Live Founder Roster →"
    : "Keep Private & Fix Operational Deficits →";

  return (
    <section
      className={`relative h-full overflow-hidden rounded-2xl border p-5 sm:p-6 ${
        canPublish
          ? "border-emerald-400/30 bg-emerald-500/[0.07]"
          : "border-neutral-800/80 bg-[#0d0f17]"
      }`}
    >
      <div
        className={`pointer-events-none absolute -top-24 -right-16 h-72 w-72 rounded-full blur-3xl ${
          canPublish ? "bg-emerald-500/10" : "bg-violet-600/10"
        }`}
        aria-hidden
      />
      <div className="relative">
        <p
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider ${
            canPublish
              ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-300"
              : "border-white/10 bg-black/40 text-zinc-300"
          }`}
        >
          {canPublish ? (
            <BadgeCheck className="h-3.5 w-3.5" aria-hidden />
          ) : null}
          {canPublish ? "Verified Pass" : "Private audit"}
        </p>
        <h3 className="mt-4 text-xl font-extrabold tracking-tight text-zinc-50 sm:text-2xl">
          {title}
        </h3>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-300 sm:text-base">
          {subtitle}
        </p>
        <ul className="mt-5 space-y-3">
          {bullets.map((bullet) => (
            <CalloutBullet
              key={"title" in bullet ? bullet.title : bullet.text}
              icon={bullet.icon}
              title={"title" in bullet ? bullet.title : undefined}
              text={bullet.text}
            />
          ))}
        </ul>
        <button
          type="button"
          disabled={status === "saving"}
          onClick={() => void persistOrSignUp(canPublish)}
          className={`mt-6 inline-flex w-full cursor-pointer items-center justify-center rounded-lg px-4 py-3 text-sm font-bold tracking-tight text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
            canPublish
              ? "bg-emerald-600 hover:bg-emerald-500"
              : "bg-brand hover:bg-brandHover"
          }`}
        >
          {status === "saving" ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
          ) : null}
          {buttonLabel}
        </button>
        {message ? (
          <p
            className={`mt-3 text-sm ${
              status === "error" ? "text-red-300" : "text-emerald-300"
            }`}
          >
            {message}
          </p>
        ) : null}
      </div>
    </section>
  );
}
