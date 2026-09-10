"use client";

import { useState } from "react";
import { ArrowRight, Lock, Loader2, ShieldCheck } from "lucide-react";
import { fetchWithAuth } from "@/lib/fetch-with-auth";
import {
  cachePendingProductionAudit,
  canPublishProductionScore,
  type ProductionAuditClaim,
} from "@/lib/production-audit";
import { createClient } from "@/utils/supabase/client";

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
      <section className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4">
        <p className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-400">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
          Verified talent badge
        </p>
        <h3 className="mt-2 text-sm font-bold tracking-tight text-textMain">
          Production-Grade Codebase Verified
        </h3>
        <p className="mt-2 text-xs leading-relaxed text-textMuted">
          Attach this score to your profile so founders can request intros from
          verified work.
        </p>
        <button
          type="button"
          disabled={status === "saving"}
          onClick={() => void persistOrSignUp(true)}
          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-brand px-3 py-2.5 text-xs font-bold tracking-tight text-white transition-colors duration-200 hover:bg-brandHover disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
        >
          {status === "saving" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          )}
          Save Score to Profile / Show to Employers
        </button>
        <p className="mt-2 text-[10px] text-textMuted">
          Sign in or create an account to attach this scorecard to your profile.
        </p>
        {message ? (
          <p
            className={`mt-2 text-xs ${
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
    <section className="rounded-xl border border-border bg-panel p-4">
      <p className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-textMuted">
        <Lock className="h-3.5 w-3.5" aria-hidden />
        Private diagnostic
      </p>
      <h3 className="mt-2 text-sm font-bold tracking-tight text-textMain">
        Private Diagnostic
      </h3>
      <p className="mt-2 text-xs leading-relaxed text-textMuted">
        Employer-visible profiles need a 75+ score. Fix CI/CD or test density
        and re-run, or save this diagnostic privately.
      </p>
      <button
        type="button"
        disabled={status === "saving"}
        onClick={() => void persistOrSignUp(false)}
        className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-transparent px-3 py-2.5 text-xs font-bold tracking-tight text-white transition-colors duration-200 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
      >
        {status === "saving" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        ) : (
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        )}
        Save Score to Profile
      </button>
      {message ? (
        <p
          className={`mt-2 text-xs ${
            status === "error" ? "text-red-300" : "text-textMuted"
          }`}
        >
          {message}
        </p>
      ) : null}
    </section>
  );
}
