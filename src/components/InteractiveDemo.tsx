"use client";

import { useState } from "react";
import {
  Check,
  Compass,
  FileDown,
  Link2,
  Lock,
  Mail,
  Share2,
  ShieldCheck,
  User,
} from "lucide-react";
import { ProvixLogo } from "@/components/ProvixLogo";
import ScoreMeter from "@/components/ScoreMeter";
import ProductionScoreVerifiedBadge from "@/components/ProductionScoreVerifiedBadge";

type DemoNav =
  | "profile"
  | "talent"
  | "intros"
  | "auditor";

type ProfileSubTab = "overview" | "proof" | "badge";

const SECTION_LABEL =
  "text-[11px] font-semibold uppercase tracking-wider text-zinc-500";
const SIDEBAR_SECTION =
  "mb-1 block px-3 font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-500";
const PASS_BADGE_CLASS =
  "border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 font-mono text-xs px-2.5 py-1 rounded-md";
const GLASS_CARD =
  "rounded-xl border border-white/[0.08] bg-[#131316]/90 shadow-2xl backdrop-blur-xl";

const SCORE = 84;
const MOCK_NAME = "Alex Rivera";
const MOCK_HANDLE = "alex-rivera";

const SKILLS = [
  "TypeScript",
  "Next.js",
  "Node.js",
  "Tailwind CSS",
  "Supabase",
] as const;

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

const WORKSPACE_NAV = [
  { id: "profile" as const, label: "Profile", icon: User },
  { id: "talent" as const, label: "Talent Network", icon: Compass },
  { id: "intros" as const, label: "Intro Requests", icon: Mail, badge: "2 new" },
] as const;

function metricTone(score: number): string {
  if (score >= 80) return "text-emerald-400";
  if (score >= 60) return "text-violet-400";
  if (score > 0) return "text-orange-300";
  return "text-red-400";
}

function navItemClass(active: boolean) {
  return `flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
    active
      ? "bg-white/[0.06] font-medium text-white"
      : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100"
  }`;
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

function ExecutiveVerdictCard() {
  return (
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

        <div className="shrink-0 space-y-2 sm:text-right">
          <div className={SECTION_LABEL}>Readiness Score</div>
          <div className="flex items-baseline gap-1 sm:justify-end">
            <span className="font-mono text-4xl font-black tabular-nums tracking-tight text-emerald-400 drop-shadow-[0_0_12px_rgba(16,185,129,0.18)] sm:text-5xl">
              {SCORE}
            </span>
            <span className="text-base font-semibold text-zinc-400">/100</span>
          </div>
          <span
            className={`mt-1 inline-flex w-fit max-w-full items-center rounded-md border px-2.5 py-1 text-xs font-medium ${PASS_BADGE_CLASS}`}
          >
            Production Ready / Top 8%
          </span>
        </div>
      </div>

      <ScoreMeter score={SCORE} />

      <div className="space-y-3 rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-5 backdrop-blur-sm sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className={`${SECTION_LABEL} mb-1`}>Codebase Score</div>
            <p className="text-sm font-semibold text-zinc-100">
              Top 8% Codebase Benchmark (n = 142 audited repos)
            </p>
          </div>
          <ProductionScoreVerifiedBadge score={SCORE} />
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
                <p className="text-sm font-semibold text-zinc-100">{row.label}</p>
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
  );
}

function ReadmeBadgePanel() {
  return (
    <div className="space-y-4">
      <div className={`${GLASS_CARD} px-4 py-6 text-center`}>
        <p className={`${SECTION_LABEL} mb-4`}>README Badge preview</p>
        <div className="mx-auto inline-flex items-center gap-2 rounded-md border border-white/[0.08] bg-[#070709] px-3 py-1.5 opacity-60">
          <Lock className="h-3.5 w-3.5 text-zinc-500" aria-hidden />
          <span className="font-mono text-xs text-zinc-500">
            Provix Verified — locked
          </span>
        </div>
      </div>
      <div className="rounded-xl border border-dashed border-white/[0.1] bg-[#070709] p-4">
        <p className="text-sm font-semibold text-zinc-200">
          Badge generated only after verified repo run
        </p>
        <p className="mt-2 text-xs leading-relaxed text-zinc-500">
          Embed snippets are available after an authenticated repository audit —
          not from this interactive demo preview.
        </p>
        <button
          type="button"
          disabled
          aria-disabled="true"
          title="Badge generated only after verified repo run"
          className="mt-3 inline-flex cursor-not-allowed items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs font-semibold text-zinc-500 opacity-70"
        >
          <Lock className="h-3.5 w-3.5" aria-hidden />
          Copy Markdown
        </button>
      </div>
    </div>
  );
}

function ProfilePreview({
  subTab,
  onSubTabChange,
}: {
  subTab: ProfileSubTab;
  onSubTabChange: (tab: ProfileSubTab) => void;
}) {
  const tabs: { id: ProfileSubTab; label: string }[] = [
    { id: "overview", label: "Overview & Bio" },
    { id: "proof", label: "Proof of Work" },
    { id: "badge", label: "README Badge" },
  ];

  return (
    <div className="space-y-5">
      <div className="flex gap-5 overflow-x-auto border-b border-white/[0.08]">
        {tabs.map((tab) => {
          const active = subTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onSubTabChange(tab.id)}
              className={`cursor-pointer whitespace-nowrap pb-3 text-xs font-bold transition-all ${
                active
                  ? "border-b-2 border-brand text-brand"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="rounded-2xl border border-white/[0.08] bg-[#131316]/90 p-6 sm:p-8">
        {subTab === "overview" ? (
          <div className="space-y-6">
            <div className="flex items-center gap-4 border-b border-white/[0.08] pb-6">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-brand/40 bg-brand/20 text-lg font-bold text-brand">
                AR
              </div>
              <div className="min-w-0">
                <p className="truncate text-xl font-bold text-zinc-50">
                  {MOCK_NAME}
                </p>
                <p className="mt-1 text-xs font-medium text-brand">
                  Full-Stack Engineer · @{MOCK_HANDLE}
                </p>
              </div>
              <span className="ml-auto hidden items-center gap-1.5 rounded-full border border-violet-500/20 bg-violet-500/10 px-2.5 py-1 text-[10px] font-semibold text-violet-300 sm:inline-flex">
                <span className="h-1.5 w-1.5 rounded-full bg-violet-500" />
                Interviewing
              </span>
            </div>
            <div>
              <p className={`${SECTION_LABEL} mb-2`}>Tech stack</p>
              <div className="flex flex-wrap gap-2">
                {SKILLS.map((skill) => (
                  <span
                    key={skill}
                    className="inline-flex items-center rounded-full border border-white/[0.08] bg-[#070709] px-2.5 py-1 text-xs font-medium text-zinc-300"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <p className={`${SECTION_LABEL} mb-2`}>Bio</p>
              <p className="text-sm leading-relaxed text-zinc-300">
                Full-stack engineer building production systems. Verified clean
                Next.js architecture.
              </p>
            </div>
          </div>
        ) : null}

        {subTab === "proof" ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-zinc-100">
                  northwind/checkout-bff
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  Primary verified repository on the public roster
                </p>
              </div>
              <span className="inline-flex items-center rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 font-mono text-[10px] font-bold text-emerald-300">
                {SCORE}/100 · Top 8%
              </span>
            </div>
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {METRIC_ROWS.map((row) => (
                <li
                  key={row.label}
                  className="rounded-lg border border-zinc-800/80 bg-zinc-950/60 px-2.5 py-2.5 text-center"
                >
                  <p
                    className={`font-mono text-sm font-bold tabular-nums ${metricTone(
                      row.score
                    )}`}
                  >
                    {row.score}
                  </p>
                  <p className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-zinc-400">
                    {row.label}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {subTab === "badge" ? <ReadmeBadgePanel /> : null}
      </div>
    </div>
  );
}

function headerCopy(nav: DemoNav): {
  title: string;
  subtitle: string;
  action: string;
} {
  if (nav === "auditor") {
    return {
      title: "Roster Verification",
      subtitle:
        "Automated AST code audits and verified architectural benchmarks",
      action: "Run Audit",
    };
  }
  if (nav === "profile") {
    return {
      title: "Public Dossier Preview",
      subtitle:
        "Manage your verified repositories, tech stack, and inbound visibility",
      action: "Share Profile",
    };
  }
  if (nav === "talent") {
    return {
      title: "Talent Network",
      subtitle: "Roles matched to verified production engineers",
      action: "Browse Roles",
    };
  }
  return {
    title: "Intro Requests",
    subtitle: "Inbound founder interest on your verified dossier",
    action: "View Inbox",
  };
}

export default function InteractiveDemo() {
  const [nav, setNav] = useState<DemoNav>("auditor");
  const [profileSubTab, setProfileSubTab] = useState<ProfileSubTab>("overview");
  const [linkCopied, setLinkCopied] = useState(false);

  const header = headerCopy(nav);

  const copyProfileLink = async () => {
    try {
      const origin =
        typeof window !== "undefined" ? window.location.origin : "";
      await navigator.clipboard.writeText(`${origin}/p/${MOCK_HANDLE}`);
      setLinkCopied(true);
      window.setTimeout(() => setLinkCopied(false), 1800);
    } catch {
      setLinkCopied(false);
    }
  };

  return (
    <section className="mx-auto mt-10 w-full max-w-6xl print:hidden">
      <p className="mt-12 mb-6 text-center text-sm font-medium tracking-wide text-zinc-400">
        Explore Provix — Interactive Demo
      </p>
      <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#090A0F] text-zinc-100 shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
        <div className="flex items-center gap-2 border-b border-white/[0.08] bg-[#0E0E12] px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" aria-hidden />
          <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" aria-hidden />
          <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" aria-hidden />
          <div className="ml-2 flex min-w-0 flex-1 items-center gap-2 rounded-md border border-white/[0.08] bg-[#070709] px-3 py-1.5">
            <ProvixLogo className="h-3.5 w-3.5" showText={false} />
            <span className="truncate font-mono text-[11px] text-zinc-400">
              app.getprovix.com/dashboard
              {nav === "auditor"
                ? "/auditor"
                : nav === "profile"
                  ? "/profile"
                  : ""}
            </span>
          </div>
        </div>

        <div className="flex h-[600px] min-h-[600px] overflow-hidden">
          <aside className="hidden h-full w-56 shrink-0 flex-col overflow-y-auto border-r border-white/[0.08] bg-[#0E0E12] p-4 md:flex">
            <div className="mb-6 flex items-center gap-2.5 px-3 py-1.5">
              <ProvixLogo className="h-6 w-6" showText={false} />
              <span className="text-base font-semibold tracking-tight text-white">
                PROVIX
              </span>
            </div>

            <div>
              <span className={SIDEBAR_SECTION}>Workspace</span>
              <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
                {WORKSPACE_NAV.map((item) => {
                  const active = nav === item.id;
                  const Icon = item.icon;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => setNav(item.id)}
                        className={navItemClass(active)}
                      >
                        <span
                          className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                            active ? "bg-violet-400" : "bg-transparent"
                          }`}
                          aria-hidden
                        />
                        <Icon
                          className={`h-4 w-4 shrink-0 ${
                            active ? "text-violet-300" : "text-zinc-400"
                          }`}
                          strokeWidth={1.5}
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1 truncate">
                          {item.label}
                        </span>
                        {"badge" in item && item.badge ? (
                          <span className="ml-auto inline-flex items-center rounded border border-white/[0.08] bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px] font-medium tabular-nums text-zinc-200">
                            {item.badge}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="mt-5">
              <span className={SIDEBAR_SECTION}>Tools</span>
              <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
                <li>
                  <button
                    type="button"
                    onClick={() => setNav("auditor")}
                    className={navItemClass(nav === "auditor")}
                  >
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                        nav === "auditor" ? "bg-violet-400" : "bg-transparent"
                      }`}
                      aria-hidden
                    />
                    <ShieldCheck
                      className={`h-4 w-4 shrink-0 ${
                        nav === "auditor" ? "text-violet-300" : "text-zinc-400"
                      }`}
                      strokeWidth={1.5}
                      aria-hidden
                    />
                    <span className="truncate">Roster Verification</span>
                  </button>
                </li>
              </ul>
            </div>

            <div className="mt-auto border-t border-white/[0.08] pt-3">
              <div className="flex items-center gap-2.5 rounded-lg border border-white/[0.08] bg-[#131316]/90 px-2.5 py-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-zinc-700 bg-zinc-800 text-[11px] font-semibold text-zinc-300">
                  AR
                </span>
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-zinc-200">
                    {MOCK_NAME}
                  </span>
                  <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-zinc-400">
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full bg-violet-500"
                      aria-hidden
                    />
                    <span className="truncate">Interviewing</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void copyProfileLink()}
                  aria-label={linkCopied ? "Profile link copied" : "Copy profile link"}
                  className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-[#1A1A1E] hover:text-zinc-200"
                >
                  {linkCopied ? (
                    <Check className="h-4 w-4 text-emerald-400" strokeWidth={1.5} />
                  ) : (
                    <Link2 className="h-4 w-4" strokeWidth={1.5} />
                  )}
                </button>
              </div>
            </div>
          </aside>

          <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[#090A0F]">
            <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-white/[0.08] px-3 py-2 md:hidden">
              {[
                { id: "auditor" as const, label: "Audits" },
                { id: "profile" as const, label: "Profile" },
                { id: "talent" as const, label: "Network" },
                { id: "intros" as const, label: "Intros" },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setNav(item.id)}
                  className={`cursor-pointer rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
                    nav === item.id
                      ? "bg-white/[0.06] text-white"
                      : "text-zinc-500 hover:text-zinc-200"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="flex shrink-0 flex-col gap-3 border-b border-white/[0.08] px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6">
              <div className="min-w-0">
                <h1 className="text-xl font-extrabold tracking-tight text-zinc-50 sm:text-2xl">
                  {header.title}
                </h1>
                <p className="mt-1 max-w-xl text-sm text-zinc-500">
                  {header.subtitle}
                </p>
              </div>
              <span className="inline-flex shrink-0 items-center justify-center rounded-lg bg-[#F4F4F6] px-3.5 py-2 text-xs font-semibold text-[#0B0B0D]">
                {header.action}
              </span>
            </div>

            <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-4 sm:p-6">
              {nav === "auditor" ? <ExecutiveVerdictCard /> : null}

              {nav === "profile" ? (
                <ProfilePreview
                  subTab={profileSubTab}
                  onSubTabChange={setProfileSubTab}
                />
              ) : null}

              {nav === "talent" ? (
                <div className={`${GLASS_CARD} space-y-3 p-6`}>
                  <p className={SECTION_LABEL}>Matched roles</p>
                  <p className="text-sm font-semibold text-zinc-100">
                    Early-stage teams hiring verified full-stack engineers
                  </p>
                  <p className="text-sm leading-relaxed text-zinc-400">
                    Sign in to browse live openings matched to your audit score
                    and declared stack. Guests see this preview only.
                  </p>
                  <div className="grid gap-2 pt-2">
                    {[
                      "Founding Engineer · Seed SaaS",
                      "Full-Stack · Series A Infra",
                    ].map((role) => (
                      <div
                        key={role}
                        className="rounded-lg border border-white/[0.08] bg-[#070709] px-3 py-2.5 text-sm text-zinc-300"
                      >
                        {role}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {nav === "intros" ? (
                <div className={`${GLASS_CARD} space-y-3 p-6`}>
                  <div className="flex items-center justify-between gap-2">
                    <p className={SECTION_LABEL}>Inbox</p>
                    <span className="rounded border border-white/[0.08] bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px] text-zinc-200">
                      2 new
                    </span>
                  </div>
                  {[
                    {
                      company: "Northstar Labs",
                      note: "Interested in your checkout BFF audit",
                    },
                    {
                      company: "Harbor Systems",
                      note: "Wants to discuss Full-Stack ownership",
                    },
                  ].map((item) => (
                    <div
                      key={item.company}
                      className="rounded-lg border border-white/[0.08] bg-[#070709] px-3 py-3"
                    >
                      <p className="text-sm font-semibold text-zinc-100">
                        {item.company}
                      </p>
                      <p className="mt-0.5 text-xs text-zinc-500">{item.note}</p>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>

      </div>
    </section>
  );
}
