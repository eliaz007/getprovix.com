"use client";

import { useState } from "react";
import { ArrowRight, Lock, Loader2, ShieldCheck } from "lucide-react";
import { handleGitHubSignIn } from "@/lib/github-auth";
import { fetchWithAuth } from "@/lib/fetch-with-auth";
import {
  cachePendingProductionAudit,
  canPublishProductionScore,
  claimAuditLoginHref,
  type ProductionAuditClaim,
} from "@/lib/production-audit";
import { createClient } from "@/utils/supabase/client";

export default function ScorecardPublicationCallout({
  claim,
}: {
  claim: ProductionAuditClaim;
}) {
  const canPublish = canPublishProductionScore(claim.production_score);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle"
  );
  const [message, setMessage] = useState<string | null>(null);

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
        const { error } = await handleGitHubSignIn("/dashboard");
        if (error) {
          window.location.href = claimAuditLoginHref();
          return;
        }
        return;
      }

      const response = await fetchWithAuth("/api/profile/production-audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextClaim),
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Could not save this audit.");
      }

      setStatus("saved");
      setMessage(
        nextClaim.is_publicly_visible
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

  if (canPublish) {
    return (
      <section className="rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-6">
        <p className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-emerald-400">
          <ShieldCheck className="h-4 w-4" aria-hidden />
          Verified talent badge
        </p>
        <h3 className="mt-3 text-xl font-bold tracking-tight text-textMain">
          Production-Grade Codebase Verified
        </h3>
        <p className="mt-3 text-sm leading-relaxed text-textMuted">
          Founders on Provix use verified repo scorecards to bypass resume
          screens. Attach this score to an anonymous profile to receive direct
          introduction requests.
        </p>
        <button
          type="button"
          disabled={status === "saving"}
          onClick={() => void persistOrSignUp(true)}
          className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-brand text-white px-4 py-3 text-sm font-bold tracking-tight transition-colors duration-200 hover:bg-brandHover disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
        >
          {status === "saving" ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <ArrowRight className="h-4 w-4" aria-hidden />
          )}
          Publish Scorecard to Talent Roster
        </button>
        <p className="mt-3 text-xs text-textMuted">
          Unauthenticated authors continue with GitHub to create a candidate
          account.
        </p>
        {message ? (
          <p
            className={`mt-3 text-sm ${
 status === "error" ? "text-red-300" : "text-emerald-300"
 }`}
          >
            {message}
          </p>
        ) : null}
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-border bg-panel p-6">
      <p className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-textMuted">
        <Lock className="h-4 w-4" aria-hidden />
        Private diagnostic
      </p>
      <h3 className="mt-3 text-xl font-bold tracking-tight text-textMain">
        Private Diagnostic Saved
      </h3>
      <p className="mt-3 text-sm leading-relaxed text-textMuted">
        Profiles in the employer pool require a 75+ score. Address the test
        density or CI/CD flags above and re-run your repo to earn a verified
        talent badge.
      </p>
      <button
        type="button"
        disabled={status === "saving"}
        onClick={() => void persistOrSignUp(false)}
        className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-transparent px-4 py-3 text-sm font-bold tracking-tight text-white transition-colors duration-200 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
      >
        {status === "saving" ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <ArrowRight className="h-4 w-4" aria-hidden />
        )}
        Save Private Audit
      </button>
      {message ? (
        <p
          className={`mt-3 text-sm ${
 status === "error" ? "text-red-300" : "text-textMuted"
 }`}
        >
          {message}
        </p>
      ) : null}
    </section>
  );
}
