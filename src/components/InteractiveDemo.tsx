"use client";

import Link from "next/link";
import { FileDown, Lock, Share2, ShieldCheck } from "lucide-react";
import ScoreMeter from "@/components/ScoreMeter";
import ProductionScoreVerifiedBadge from "@/components/ProductionScoreVerifiedBadge";

const SECTION_LABEL =
  "text-[11px] font-semibold uppercase tracking-wider text-zinc-500";

const PASS_BADGE_CLASS =
  "border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 font-mono text-xs px-2.5 py-1 rounded-md";

const METRIC_ROWS = [
  {
    label: "Architecture",
    score: 88,
    weightPct: 35,
    contribution: "30.8",
    issues: "0 structure gaps",
  },
  {
    label: "Testing",
    score: 82,
    weightPct: 25,
    contribution: "20.5",
    issues: "1 missing edge suite",
  },
  {
    label: "DevOps",
    score: 85,
    weightPct: 20,
    contribution: "17.0",
    issues: "0 missing workflows",
  },
  {
    label: "Resilience",
    score: 81,
    weightPct: 20,
    contribution: "16.2",
    issues: "0 unhandled fatal errors",
  },
] as const;

const PEER_REVIEW_BULLETS = [
  "The codebase implements clean TypeScript typing and modular App Router conventions.",
  "Handlers are decoupled from shared presentation layouts.",
  "To reach 90+, add explicit try/catch boundary wrappers on external data fetches and increase assertion depth in API route tests.",
];

const FOUNDER_VERDICT_BULLETS = [
  "The repository demonstrates senior architectural discipline with functional CI workflows and isolated error boundaries.",
  "Low production risk.",
  "Well-suited for an early-stage team requiring rapid execution without technical debt.",
];

function metricTone(score: number): string {
  if (score >= 80) return "text-emerald-400";
  if (score >= 60) return "text-violet-400";
  if (score > 0) return "text-orange-300";
  return "text-red-400";
}

function BriefBullets({ items }: { items: string[] }) {
  return (
    <ul className="mt-2 space-y-1 text-[12px] leading-snug text-zinc-200">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-1.5">
          <span aria-hidden className="leading-snug">
            •
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export default function InteractiveDemo() {
  const score = 84;

  return (
    <section className="mx-auto mt-10 w-full max-w-5xl print:hidden">
      <div className="overflow-hidden rounded-2xl border border-zinc-800/80 bg-[#090A0F] text-zinc-100 shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
        <div className="flex items-center gap-2 border-b border-zinc-800/80 bg-zinc-950 px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" aria-hidden />
          <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" aria-hidden />
          <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" aria-hidden />
          <div className="ml-2 flex min-w-0 flex-1 items-center gap-2 rounded-md border border-zinc-800/80 bg-zinc-950 px-3 py-1.5">
            <ShieldCheck
              className="h-3.5 w-3.5 shrink-0 text-emerald-400"
              aria-hidden
            />
            <span className="truncate font-mono text-[11px] text-zinc-400">
              app.getprovix.com/dashboard/auditor
            </span>
          </div>
        </div>

        <div className="bg-[#090A0F] p-4 sm:p-6">
          <section className="space-y-4 rounded-xl border border-zinc-800/80 bg-zinc-950 p-5 backdrop-blur-sm sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 space-y-3">
                <div className={SECTION_LABEL}>Executive Verdict</div>
                <h2 className="truncate text-lg font-extrabold tracking-tight text-zinc-50 sm:text-xl">
                  northwind/checkout-bff
                </h2>
                <p className="font-mono text-xs tabular-nums text-zinc-400 sm:text-sm">
                  Audited Oct 2, 2026 · Target: 75+
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center rounded-md border border-zinc-700/60 bg-zinc-900/60 px-2.5 py-1 text-[11px] font-semibold text-zinc-300">
                    Full-stack dev
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700/60 bg-zinc-900/80 px-2.5 py-1 text-xs font-medium text-zinc-400">
                    <Lock className="h-3.5 w-3.5 text-zinc-400" aria-hidden />
                    Private Audit
                  </span>
                  <div className="inline-flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-lg border border-brand/70 bg-brand/20 px-3.5 py-1.5 text-xs font-medium text-white">
                      <Share2 className="h-3.5 w-3.5" aria-hidden />
                      Share Audit
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-lg border border-brand/70 bg-brand/20 px-3.5 py-1.5 text-xs font-medium text-white">
                      <FileDown className="h-3.5 w-3.5" aria-hidden />
                      Export Dossier (PDF)
                    </span>
                  </div>
                </div>
              </div>

              <div className="shrink-0 space-y-2 sm:text-right">
                <div className={SECTION_LABEL}>Readiness Score</div>
                <div className="flex items-baseline gap-1 sm:justify-end">
                  <span className="font-mono text-4xl font-black tabular-nums tracking-tight text-emerald-400 drop-shadow-[0_0_12px_rgba(16,185,129,0.18)] sm:text-5xl">
                    {score}
                  </span>
                  <span className="text-base font-semibold text-zinc-400">
                    /100
                  </span>
                </div>
                <span
                  className={`mt-1 inline-flex w-fit max-w-full items-center rounded-md border px-2.5 py-1 text-xs font-medium ${PASS_BADGE_CLASS}`}
                >
                  Production Ready / Top 8%
                </span>
              </div>
            </div>

            <ScoreMeter score={score} />

            <div className="space-y-3 rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-6 backdrop-blur-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className={`${SECTION_LABEL} mb-1`}>Codebase Score</div>
                  <p className="text-sm font-semibold text-zinc-100">
                    Top 8% Codebase Benchmark (n = 142 audited repos)
                  </p>
                </div>
                <ProductionScoreVerifiedBadge score={score} />
              </div>

              <div className="mt-4 space-y-3">
                <section className="rounded-lg border border-zinc-800/80 bg-zinc-950/70 px-3 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                      Technical Peer Review
                    </p>
                    <span className="rounded border border-blue-500/20 bg-blue-500/10 px-2 py-0.5 text-xs text-blue-400">
                      FOR CANDIDATES
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-snug text-zinc-500">
                    Actionable engineering feedback to improve code health.
                  </p>
                  <BriefBullets items={PEER_REVIEW_BULLETS} />
                </section>

                <section className="rounded-lg border border-zinc-800/80 bg-zinc-950/70 px-3 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                        Founder Hiring Verdict
                      </p>
                      <span className="rounded border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-400">
                        FOR HIRING TEAMS
                      </span>
                    </div>
                    <span className="inline-flex items-center rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">
                      Mid-Level
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-snug text-zinc-500">
                    Production risk evaluation for founders and recruiters.
                  </p>
                  <BriefBullets items={FOUNDER_VERDICT_BULLETS} />
                </section>
              </div>

              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {METRIC_ROWS.map((row) => (
                  <li
                    key={row.label}
                    className="rounded-lg border border-zinc-800/80 bg-zinc-950/60 px-3 py-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-zinc-100">
                        {row.label}
                      </p>
                      <span
                        className={`font-mono text-sm font-bold tabular-nums ${metricTone(
                          row.score
                        )}`}
                      >
                        {row.score}
                      </span>
                    </div>
                    <p className="mt-1 font-mono text-[11px] tabular-nums text-zinc-300">
                      {row.score} × {row.weightPct}% = {row.contribution} pts
                    </p>
                    <p className="mt-1 text-sm text-zinc-400">{row.issues}</p>
                  </li>
                ))}
              </ul>

              <p className="font-mono text-[11px] tabular-nums text-zinc-500">
                Weighted total 84/100 = round(architecture×35% + testing×25% +
                DevOps×20% + resilience×20%)
              </p>
            </div>
          </section>
        </div>

        <div className="flex flex-col items-start justify-between gap-3 border-t border-zinc-800/80 bg-zinc-950 px-4 py-4 sm:flex-row sm:items-center">
          <p className="text-sm leading-relaxed text-zinc-400">
            Ready to benchmark a repository you own?
          </p>
          <Link
            href="/login?next=/dashboard/auditor"
            className="inline-flex cursor-pointer items-center justify-center rounded-lg bg-[#F4F4F6] px-4 py-2.5 text-sm font-semibold text-[#0B0B0D] transition-colors hover:bg-white"
          >
            Sign in to run your audit
          </Link>
        </div>
      </div>
    </section>
  );
}
