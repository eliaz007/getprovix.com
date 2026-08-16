"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { Code2, ChevronDown, Shield, Zap } from "lucide-react";
import { createClient } from "@/utils/supabase/client";

type PreviewCandidate = {
  alias: string;
  score: number | string | null;
  skills: string[] | null;
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

function formatScore(score: PreviewCandidate["score"]): string {
  if (score == null || score === "") {
    return "—";
  }

  if (typeof score === "number") {
    return `${Math.round(score)}%`;
  }

  const trimmed = score.trim();
  return trimmed.endsWith("%") ? trimmed : `${trimmed}%`;
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [previewCandidate, setPreviewCandidate] =
    useState<PreviewCandidate | null>(null);
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

    void (async () => {
      try {
        const { data, error } = await supabase
          .from("candidates")
          .select("alias, score, skills")
          .order("score", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) {
          console.error("Failed to load dashboard preview candidate:", error);
          return;
        }

        if (data) {
          setPreviewCandidate({
            alias: data.alias ?? "Anonymous Candidate",
            score: data.score ?? null,
            skills: Array.isArray(data.skills) ? data.skills : [],
          });
        }
      } finally {
        setPreviewLoading(false);
      }
    })();
  }, []);

  const isLoggedIn = Boolean(user);
  const primaryCtaHref = isLoggedIn ? "/dashboard" : "/login";
  const dashboardPreviewHref = isLoggedIn ? "/dashboard" : "/login";
  const previewSkills = previewCandidate?.skills?.slice(0, 4) ?? [];

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
      {/* --- TOP NAVIGATION --- */}
      <header className="border-b border-zinc-800/80 sticky top-0 z-50 bg-zinc-950/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-800 flex items-center justify-center font-extrabold text-white text-xs shadow-[0_0_15px_rgba(79,70,229,0.4)]">
              VX
            </div>
            <span className="font-extrabold text-lg tracking-tight text-white">
              VANGUARD X
            </span>
          </Link>

          <nav className="flex items-center gap-6">
            {checkingSession ? (
              <div className="h-4 w-14 rounded bg-zinc-800 animate-pulse" aria-hidden />
            ) : isLoggedIn ? (
              <Link href="/dashboard" className="text-sm font-medium text-zinc-400 hover:text-white transition-colors">
                Dashboard
              </Link>
            ) : (
              <Link href="/login" className="text-sm font-medium text-zinc-400 hover:text-white transition-colors">
                Log In
              </Link>
            )}
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* --- HERO --- */}
        <section className="max-w-6xl mx-auto px-6 pt-24 pb-20 text-center">
          <span className="inline-flex items-center gap-1.5 text-xs font-mono font-semibold px-3 py-1.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            [!] Product-Led Tech Recruitment
          </span>

          <h1 className="mt-6 text-4xl sm:text-6xl font-extrabold tracking-tight max-w-3xl mx-auto">
            Hire the Top 1%.{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-cyan-300 to-indigo-400">
              100% Anonymous.
            </span>
          </h1>

          <p className="mt-6 text-zinc-400 text-base sm:text-lg max-w-2xl mx-auto">
            A talent marketplace built on blind auditions. We hide the resumes
            and rank developers by their code execution, so you can hire
            purely on verified skill.
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
                  href={primaryCtaHref}
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
            href={dashboardPreviewHref}
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
            <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-1 space-y-3 text-left">
                {previewLoading ? (
                  <>
                    <div className="h-2.5 w-3/4 rounded-full bg-zinc-800 animate-pulse" />
                    <div className="h-2.5 w-1/2 rounded-full bg-zinc-800 animate-pulse" />
                    <div className="h-2.5 w-2/3 rounded-full bg-zinc-800 animate-pulse" />
                  </>
                ) : previewCandidate ? (
                  <>
                    <div className="text-[10px] text-zinc-500 uppercase tracking-wide">
                      Candidate Alias
                    </div>
                    <div className="text-sm font-semibold text-white">
                      {previewCandidate.alias}
                    </div>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {previewSkills.length > 0 ? (
                        previewSkills.map((skill) => (
                          <span
                            key={skill}
                            className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-indigo-500/10 text-indigo-300 border border-indigo-500/20"
                          >
                            {skill}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-zinc-500">
                          Skills pending audit
                        </span>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="text-xs text-zinc-500">
                    No live candidates yet — check back soon.
                  </div>
                )}
              </div>
              <div className="sm:col-span-2 grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3 text-left">
                  <div className="text-[10px] text-zinc-500 uppercase tracking-wide">
                    Execution Score
                  </div>
                  <div className="text-lg font-extrabold text-emerald-400 mt-1">
                    {previewLoading ? "—" : formatScore(previewCandidate?.score ?? null)}
                  </div>
                </div>
                <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3 text-left">
                  <div className="text-[10px] text-zinc-500 uppercase tracking-wide">
                    Skill Tags
                  </div>
                  <div className="text-lg font-extrabold text-white mt-1">
                    {previewLoading
                      ? "—"
                      : previewSkills.length > 0
                        ? previewSkills.length
                        : 0}
                  </div>
                </div>
                <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3 col-span-2 text-left">
                  <div className="text-[10px] text-zinc-500 uppercase tracking-wide">
                    Status
                  </div>
                  <div className="text-sm font-semibold text-indigo-400 mt-1">
                    {previewCandidate
                      ? "Anonymized until upgrade"
                      : "Waiting for first candidate audit"}
                  </div>
                </div>
              </div>
            </div>
          </Link>
        </section>

        {/* --- FEATURE GRID --- */}
        <section className="max-w-6xl mx-auto px-6 pb-24">
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
              How Vanguard X works
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

      <footer className="border-t border-zinc-800/80 py-8">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-zinc-500">
          <span className="font-semibold text-zinc-400">VANGUARD X</span>
          <span>Product-led tech recruitment · Hire the top 1%.</span>
        </div>
      </footer>
    </div>
  );
}
