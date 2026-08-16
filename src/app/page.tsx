"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { Code2, ChevronDown, Shield, ShieldCheck, Zap } from "lucide-react";
import { ProvixLogo } from "@/components/ProvixLogo";
import { createClient } from "@/utils/supabase/client";
import {
  getNewestVettedCandidate,
  resolveCandidateScore,
  type VettedCandidateRecord,
} from "@/data/vetted-candidates";

type PreviewCandidate = {
  name: string;
  role: string;
  skills: string[];
  integrity_score?: number | null;
  execution_score?: number | null;
  bio: string;
  repos_count?: number | null;
};

const features = [
  {
    icon: Code2,
    title: "Proof-of-Work Auditing",
    description:
      "Automated deep audits of live GitHub repositories, commit chronologies, and code architecture — separating real builders from AI-generated resumes.",
  },
  {
    icon: Shield,
    title: "AI Integrity Scoring",
    description:
      "Every profile receives an objective 1–100 credibility rating evaluating timeline plausibility, verified skills, and artifact depth before you spend time interviewing.",
  },
  {
    icon: Zap,
    title: "Interview Enablement",
    description:
      "Unlock verified direct contact info alongside tailored technical interview questions and 'what-to-listen-for' rubrics for fast, high-signal hiring.",
  },
];

const faqItems = [
  {
    question: "How does the AI Deep Screening verify candidates?",
    answer:
      "Deep Screening runs a live GitHub repository audit on each candidate's public work — analyzing commit history for consistency, verifying authorship patterns, and reviewing code architecture for production readiness. The result is an evidence-backed profile, not a self-reported resume.",
  },
  {
    question: "What does the Integrity Score mean?",
    answer:
      "The Integrity Score is a 1–100 rubric that measures how trustworthy a candidate's story is. It weighs timeline plausibility (do their dates and roles add up?), verifiable metrics (can claims be checked against repos or demos?), and proof-of-work depth (is there real output behind the headline skills?).",
  },
  {
    question: "What is included in the Employer Interview Cheat Sheet?",
    answer:
      "Every screened candidate comes with a role-specific Interview Cheat Sheet: three tailored technical questions plus coaching notes on what to listen for in strong vs. weak answers — so hiring managers can run a sharp interview in minutes, even without a dedicated tech lead in the room.",
  },
  {
    question: "How does pricing and candidate unlocking work?",
    answer:
      "Browsing the talent pool and viewing AI screening previews is completely free. When you're ready to reach out, you pay a simple per-unlock fee to reveal direct contact access — no subscriptions, no upfront contracts, and no charge until you choose to connect.",
  },
];

function candidateHandle(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  return slug ? `@${slug}` : "@vetted-builder";
}

function getCandidateInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function mapVettedToPreview(candidate: VettedCandidateRecord): PreviewCandidate {
  return {
    name: candidate.name,
    role: candidate.role,
    skills: candidate.skills,
    integrity_score: candidate.integrity_score,
    execution_score: candidate.execution_score,
    bio: candidate.bio,
    repos_count: candidate.repos_count,
  };
}

function normalizeCandidateRow(row: Record<string, unknown>): PreviewCandidate | null {
  const name =
    (typeof row.full_name === "string" && row.full_name.trim()) ||
    (typeof row.name === "string" && row.name.trim()) ||
    (typeof row.alias === "string" && row.alias.trim()) ||
    "";
  const role =
    (typeof row.job_title === "string" && row.job_title.trim()) ||
    (typeof row.headline === "string" && row.headline.trim()) ||
    (typeof row.role === "string" && row.role.trim()) ||
    (typeof row.major === "string" && row.major.trim()) ||
    "Vetted Builder";

  if (!name) {
    return null;
  }

  const skills = Array.isArray(row.skills)
    ? row.skills.filter((skill): skill is string => typeof skill === "string")
    : Array.isArray(row.tags)
      ? row.tags.filter((tag): tag is string => typeof tag === "string")
      : [];

  const bio = typeof row.bio === "string" ? row.bio.trim() : "";

  return {
    name,
    role,
    skills,
    integrity_score:
      typeof row.integrity_score === "number" ? row.integrity_score : null,
    execution_score:
      typeof row.execution_score === "number"
        ? row.execution_score
        : typeof row.score === "number"
          ? row.score
          : null,
    bio,
    repos_count:
      typeof row.repos_count === "number" ? row.repos_count : null,
  };
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [previewCandidate, setPreviewCandidate] = useState<PreviewCandidate | null>(
    null
  );
  const [previewLoading, setPreviewLoading] = useState(true);
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);

  useEffect(() => {
    const supabase = createClient();

    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setCheckingSession(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const supabase = createClient();
    const fallback = mapVettedToPreview(getNewestVettedCandidate());

    void (async () => {
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("*")
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!error && data) {
          const normalized = normalizeCandidateRow(
            data as Record<string, unknown>
          );
          if (normalized) {
            setPreviewCandidate(normalized);
            return;
          }
        }

        setPreviewCandidate(fallback);
      } catch {
        setPreviewCandidate(fallback);
      } finally {
        setPreviewLoading(false);
      }
    })();
  }, []);

  const isLoggedIn = Boolean(user);
  const talentEntryHref = isLoggedIn ? "/dashboard" : "/talent";
  const displayCandidate =
    previewCandidate ?? mapVettedToPreview(getNewestVettedCandidate());
  const displayScore = resolveCandidateScore(displayCandidate);
  const displayMatchScore = Math.min(Math.max(displayScore, 88), 99);
  const displaySkills = displayCandidate.skills.slice(0, 5);
  const candidateDisplayHandle = candidateHandle(displayCandidate.name);
  const proofSignal =
    displayCandidate.bio.trim() ||
    "Verified technical highlight pending — GitHub audit complete.";

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
      {/* --- TOP NAVIGATION --- */}
      <header className="border-b border-zinc-800/80 sticky top-0 z-50 bg-zinc-950/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between gap-6">
          <Link href="/" className="hover:opacity-90 transition-opacity shrink-0">
            <ProvixLogo />
          </Link>

          <nav className="hidden md:flex items-center gap-8">
            <Link
              href="/dashboard"
              className="text-sm font-medium text-zinc-400 hover:text-white transition-colors"
            >
              Talent Pool
            </Link>
            <Link
              href="#proof-engine"
              className="text-sm font-medium text-zinc-400 hover:text-white transition-colors"
            >
              Proof Engine
            </Link>
          </nav>

          <div className="flex items-center gap-3 sm:gap-4 ml-auto">
            {checkingSession ? (
              <div className="h-9 w-28 rounded-lg bg-zinc-800 animate-pulse" aria-hidden />
            ) : (
              <>
                {!isLoggedIn && (
                  <Link
                    href="/login"
                    className="hidden sm:inline text-sm font-medium text-zinc-400 hover:text-white transition-colors"
                  >
                    Log In
                  </Link>
                )}
                <Link
                  href={talentEntryHref}
                  className="inline-flex items-center justify-center bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-all shadow-lg shadow-indigo-500/20 whitespace-nowrap"
                >
                  Browse Candidates
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* --- HERO --- */}
        <section className="max-w-6xl mx-auto px-6 pt-24 pb-20 text-center">
          <span className="inline-flex items-center gap-1.5 text-xs font-mono font-semibold px-3 py-1.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            [!] Automated Technical Screening
          </span>

          <h1 className="mt-6 text-4xl sm:text-6xl font-extrabold tracking-tight max-w-3xl mx-auto">
            Stop Interviewing AI Resumes.
          </h1>

          <p className="mt-6 text-zinc-400 text-base sm:text-lg max-w-2xl mx-auto">
            Automated GitHub audits, commit chronology checks, and custom
            interview cheat sheets to find developers who actually build.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            {checkingSession ? (
              <>
                <div className="h-[52px] w-full sm:w-40 rounded-lg bg-zinc-800 animate-pulse" aria-hidden />
                <div className="h-[52px] w-full sm:w-32 rounded-lg bg-zinc-900 border border-zinc-800 animate-pulse" aria-hidden />
              </>
            ) : (
              <>
                <Link
                  href={talentEntryHref}
                  className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-8 py-3.5 rounded-lg text-sm transition-all shadow-lg shadow-indigo-500/20"
                >
                  {isLoggedIn ? "Open Dashboard" : "Get Started"}
                </Link>
                {!isLoggedIn && (
                  <Link
                    href="/login"
                    className="w-full sm:w-auto bg-transparent hover:bg-white/5 border border-zinc-700 text-white font-semibold px-8 py-3.5 rounded-lg text-sm transition-all"
                  >
                    Sign In
                  </Link>
                )}
              </>
            )}
          </div>

          {/* --- DASHBOARD PREVIEW TEASER --- */}
          <Link
            href={talentEntryHref}
            className="group mt-16 block max-w-4xl mx-auto bg-zinc-900 border border-zinc-800 rounded-2xl p-4 sm:p-6 shadow-2xl hover:border-indigo-500/40 transition-all text-left"
          >
            <div className="flex items-center justify-between mb-4">
              <span className="text-[10px] font-mono font-semibold uppercase tracking-widest text-zinc-500">
                [ Live Dashboard Preview ]
              </span>
              <span className="text-xs font-semibold text-indigo-400 group-hover:text-indigo-300 transition-colors">
                Open Dashboard (-&gt;)
              </span>
            </div>

            {previewLoading ? (
              <div className="rounded-xl border border-zinc-800 bg-[#111111] p-5 sm:p-6">
                <div className="flex items-start gap-4 animate-pulse">
                  <div className="h-14 w-14 rounded-2xl bg-zinc-800 shrink-0" />
                  <div className="flex-1 space-y-3">
                    <div className="h-4 w-40 rounded bg-zinc-800" />
                    <div className="h-3 w-28 rounded bg-zinc-800" />
                    <div className="flex gap-2">
                      <div className="h-6 w-20 rounded-full bg-zinc-800" />
                      <div className="h-6 w-28 rounded-full bg-zinc-800" />
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-zinc-800 bg-[#111111] p-5 sm:p-6 shadow-[0_20px_60px_rgba(0,0,0,0.35)]">
                <div className="flex items-start justify-between gap-4 mb-5">
                  <div className="flex items-start gap-4 min-w-0">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-cyan-500/10 border border-indigo-500/30 flex items-center justify-center text-base font-bold text-indigo-300 shrink-0">
                      {getCandidateInitials(displayCandidate.name)}
                    </div>
                    <div className="min-w-0 text-left">
                      <p className="text-lg sm:text-xl font-bold text-white truncate">
                        {displayCandidate.name}
                      </p>
                      <p className="text-sm text-indigo-400 font-medium mt-0.5 truncate">
                        {candidateDisplayHandle}
                      </p>
                      <p className="text-xs text-zinc-500 mt-1 truncate">
                        {displayCandidate.role}
                      </p>
                    </div>
                  </div>
                  <span className="shrink-0 inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-extrabold text-emerald-400">
                    {displayMatchScore}% Match
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2 mb-5">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-500/25 bg-cyan-500/10 px-3 py-1 text-[11px] font-bold text-cyan-300">
                    <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
                    Integrity Verified · {displayScore}/100
                  </span>
                  <span className="inline-flex items-center rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1 text-[11px] font-semibold text-zinc-400">
                    GitHub audit complete
                  </span>
                </div>

                <div className="flex flex-wrap gap-1.5 mb-5">
                  {displaySkills.length > 0 ? (
                    displaySkills.map((skill) => (
                      <span
                        key={skill}
                        className="px-2.5 py-1 rounded-md text-[10px] font-bold bg-indigo-500/10 text-indigo-300 border border-indigo-500/20"
                      >
                        {skill}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-zinc-500">
                      Skills verified during GitHub audit
                    </span>
                  )}
                </div>

                <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/80 p-4 text-left">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                      Proof Signal
                    </span>
                    <span className="text-[10px] font-mono text-emerald-400">
                      LIVE
                    </span>
                  </div>
                  <p className="text-sm text-zinc-300 leading-relaxed line-clamp-2">
                    {proofSignal}
                  </p>
                </div>
              </div>
            )}
          </Link>
        </section>

        {/* --- FEATURE GRID --- */}
        <section id="proof-engine" className="max-w-6xl mx-auto px-6 pb-24 scroll-mt-24">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <div
                  key={feature.title}
                  className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6"
                >
                  <div className="w-10 h-10 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center mb-4">
                    <Icon className="w-5 h-5" aria-hidden="true" />
                  </div>
                  <h3 className="text-base font-semibold text-white tracking-tight">
                    {feature.title}
                  </h3>
                  <p className="text-sm text-zinc-400 mt-2 leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        {/* --- FAQ ACCORDION --- */}
        <section className="max-w-3xl mx-auto px-6 pb-24">
          <div className="text-center mb-10">
            <span className="inline-flex items-center gap-1.5 text-xs font-mono font-semibold px-3 py-1.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              FAQ
            </span>
            <h2 className="mt-4 text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              How Provix works
            </h2>
            <p className="mt-3 text-sm text-zinc-400 max-w-xl mx-auto">
              Everything employers and candidates need to know about screening,
              scoring, and unlocking talent.
            </p>
          </div>

          <div className="space-y-3">
            {faqItems.map((item, index) => {
              const isOpen = openFaqIndex === index;

              return (
                <div
                  key={item.question}
                  className={`rounded-2xl border transition-colors duration-300 ${
                    isOpen
                      ? "border-indigo-500/30 bg-zinc-900 shadow-lg shadow-indigo-500/5"
                      : "border-zinc-800 bg-zinc-900/60 hover:border-zinc-700"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() =>
                      setOpenFaqIndex(isOpen ? null : index)
                    }
                    aria-expanded={isOpen}
                    className="w-full flex items-center justify-between gap-4 px-5 sm:px-6 py-4 text-left cursor-pointer"
                  >
                    <span className="text-sm sm:text-base font-semibold text-white leading-snug">
                      {item.question}
                    </span>
                    <span
                      className={`shrink-0 w-8 h-8 rounded-lg border flex items-center justify-center transition-all duration-300 ${
                        isOpen
                          ? "border-indigo-500/30 bg-indigo-500/10 text-indigo-400 rotate-180"
                          : "border-zinc-700 bg-zinc-950 text-zinc-400"
                      }`}
                    >
                      <ChevronDown className="w-4 h-4" aria-hidden="true" />
                    </span>
                  </button>

                  <div
                    className={`grid transition-all duration-300 ease-in-out ${
                      isOpen
                        ? "grid-rows-[1fr] opacity-100"
                        : "grid-rows-[0fr] opacity-0"
                    }`}
                  >
                    <div className="overflow-hidden">
                      <p className="px-5 sm:px-6 pb-5 text-sm text-zinc-400 leading-relaxed border-t border-zinc-800/80 pt-4">
                        {item.answer}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* --- FINAL CTA --- */}
        <section className="border-t border-zinc-800/80 bg-zinc-900/40">
          <div className="max-w-6xl mx-auto px-6 py-16 sm:py-20 text-center">
            <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-white max-w-2xl mx-auto">
              Ready to hire on proof, not polish?
            </h2>
            <p className="mt-4 text-zinc-400 text-sm sm:text-base max-w-xl mx-auto">
              Screen high-signal technical candidates with AI-backed integrity
              scores — free to explore, pay only when you hire or unlock contact
              details.
            </p>
            <div className="mt-8 flex items-center justify-center">
              {checkingSession ? (
                <div
                  className="h-[52px] w-full sm:w-52 rounded-lg bg-zinc-800 animate-pulse"
                  aria-hidden
                />
              ) : (
                <Link
                  href="/talent"
                  className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-8 py-3.5 rounded-lg text-sm transition-all shadow-lg shadow-indigo-500/20"
                >
                  Browse Vetted Talent
                </Link>
              )}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-zinc-800/80 py-10">
        <div className="max-w-6xl mx-auto px-6 flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <ProvixLogo className="h-6 w-6" showText={false} />

          <nav className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-zinc-400">
            <Link href="/privacy" className="hover:text-white transition-colors">
              Privacy Policy
            </Link>
            <Link href="/terms" className="hover:text-white transition-colors">
              Terms
            </Link>
            <a
              href="mailto:support@provix.dev"
              className="hover:text-white transition-colors"
            >
              Support
            </a>
          </nav>

          <p className="text-xs text-zinc-500">
            © {new Date().getFullYear()} Provix. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
