"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { Code2, Shield, Zap } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import SignOutButton from "@/components/SignOutButton";

type PreviewCandidate = {
  alias: string;
  score: number | string | null;
  skills: string[] | null;
};

const features = [
  {
    icon: Code2,
    title: "AI Code Execution",
    description:
      "Every candidate is benchmarked against real, runnable challenges. No resumes to guess from — just verified execution scores.",
  },
  {
    icon: Shield,
    title: "Anonymized Matching",
    description:
      "Names, photos, and social links stay hidden until a hire is committed to, so every match starts on merit alone.",
  },
  {
    icon: Zap,
    title: "Instant Direct Hiring",
    description:
      "Skip the recruiter chain entirely. Message vetted talent directly and move from shortlist to signed offer in days.",
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
              <>
                <Link href="/dashboard" className="text-sm font-medium text-zinc-400 hover:text-white transition-colors">
                  Dashboard
                </Link>
                <SignOutButton
                  redirectTo="/"
                  className="text-sm font-semibold bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-white px-4 py-2 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                />
              </>
            ) : (
              <Link href="/login" className="text-sm font-medium text-zinc-400 hover:text-white transition-colors">
                Log In
              </Link>
            )}
            <Link
              href="/pricing"
              className="text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg transition-colors"
            >
              Pricing
            </Link>
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
      </main>
    </div>
  );
}
