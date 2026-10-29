"use client";
import ProductionScoreVerifiedBadge from "@/components/ProductionScoreVerifiedBadge";
import type { ExecutiveBrief, RecommendedRoleBand } from "@/lib/executive-brief";
import type { PillarSubLog } from "@/lib/forensic-dossier";
import {
  type ProductionAuditMetrics,
  emptyProductionAuditMetrics,
  resolveCodeHealthScore,
  weightedProductionScore,
} from "@/lib/production-audit-metrics";
import { formatCodebaseBenchmark, type CodebaseBenchmark } from "@/lib/codebase-benchmark";
import { clampScore0to100 } from "@/lib/score-scale";
import { BriefBulletList } from "./briefbulletlist";
import { roleBandClass } from "./rolebandclass";

export function EngineeringBriefCards({
  brief,
  audience,
  historyVerifiedNote = null,
}: {
  brief: ExecutiveBrief;
  audience: "candidate" | "employer";
  historyVerifiedNote?: string | null;
}) {
  const staffReview = (
    <section className="rounded-lg border border-zinc-800/80 bg-zinc-950/70 px-3 py-3 print:px-2 print:py-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
          Technical Peer Review
        </p>
        <span className="text-xs px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
          FOR CANDIDATES
        </span>
      </div>
      <p className="mt-1 text-xs leading-snug text-zinc-500">
        Actionable engineering feedback to improve code health.
      </p>
      <BriefBulletList summary={brief.developerSummary} />
    </section>
  );
  const executiveBrief = (
    <section
      className={`rounded-lg border px-3 py-3 print:px-2 print:py-1.5 ${
        audience === "employer"
          ? "border-violet-500/30 bg-violet-500/10"
          : "border-zinc-800/80 bg-zinc-950/70"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
            Founder Hiring Verdict
          </p>
          <span className="text-xs px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
            FOR HIRING TEAMS
          </span>
        </div>
        <span
          className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold ${roleBandClass(
            brief.recommendedRoleBand
          )}`}
        >
          {brief.recommendedRoleBand}
        </span>
      </div>
      <p className="mt-1 text-xs leading-snug text-zinc-500">
        Production risk evaluation for founders and recruiters.
      </p>
      {historyVerifiedNote ? (
        <p className="mt-2 rounded-md border border-amber-500/25 bg-amber-500/10 px-2.5 py-1.5 text-[12px] leading-snug text-amber-100">
          {historyVerifiedNote}
        </p>
      ) : null}
      <BriefBulletList summary={brief.employerSummary} />
    </section>
  );

  return (
    <div className="mt-4 space-y-3">
      {audience === "employer" ? (
        <>
          {executiveBrief}
          {staffReview}
        </>
      ) : (
        <>
          {staffReview}
          {executiveBrief}
        </>
      )}
    </div>
  );
}
