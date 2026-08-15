"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/client";
import SignOutButton from "@/components/SignOutButton";

function CodeIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
    </svg>
  );
}

function BoltIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
    </svg>
  );
}

const features = [
  {
    icon: CodeIcon,
    title: "AI Code Execution",
    description:
      "Every candidate is benchmarked against real, runnable challenges. No resumes to guess from — just verified execution scores.",
  },
  {
    icon: ShieldIcon,
    title: "Anonymized Matching",
    description:
      "Names, photos, and social links stay hidden until a hire is committed to, so every match starts on merit alone.",
  },
  {
    icon: BoltIcon,
    title: "Instant Direct Hiring",
    description:
      "Skip the recruiter chain entirely. Message vetted talent directly and move from shortlist to signed offer in days.",
  },
];

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  // `user` starts null before the async session check resolves, which used
  // to make the header render "Log In" for a beat even when a session
  // already existed. Gate the auth-dependent UI on this instead of `user`
  // directly so it never flashes the wrong state before swapping to the
  // real one.
  const [checkingSession, setCheckingSession] = useState(true);

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

  const isLoggedIn = Boolean(user);
  // While logged in, both CTAs should drop straight into the real dashboard.
  // Logged out, they go to /login instead of the old /draft preview, which
  // showed a locked "create a free account" overlay on top of the landing
  // page — the whole point here is no more pop-ups blocking the marketing
  // site, just a clean handoff to the real auth flow.
  const primaryCtaHref = isLoggedIn ? "/dashboard" : "/login";
  const dashboardPreviewHref = isLoggedIn ? "/dashboard" : "/login";

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
              <div className="sm:col-span-1 space-y-2">
                <div className="h-2.5 w-3/4 rounded-full bg-zinc-800" />
                <div className="h-2.5 w-1/2 rounded-full bg-zinc-800" />
                <div className="h-2.5 w-2/3 rounded-full bg-indigo-500/30" />
                <div className="h-2.5 w-1/2 rounded-full bg-zinc-800" />
              </div>
              <div className="sm:col-span-2 grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3 text-left">
                  <div className="text-[10px] text-zinc-500 uppercase tracking-wide">Execution Score</div>
                  <div className="text-lg font-extrabold text-emerald-400 mt-1">94%</div>
                </div>
                <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3 text-left">
                  <div className="text-[10px] text-zinc-500 uppercase tracking-wide">Open Roles</div>
                  <div className="text-lg font-extrabold text-white mt-1">128</div>
                </div>
                <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3 col-span-2 text-left">
                  <div className="text-[10px] text-zinc-500 uppercase tracking-wide">Status</div>
                  <div className="text-sm font-semibold text-indigo-400 mt-1">Anonymized until upgrade</div>
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
                    <Icon />
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
