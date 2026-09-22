"use client";

import { Lock } from "lucide-react";
import { INACCESSIBLE_PUBLIC_REPO_MESSAGE } from "@/lib/inaccessible-public-audit";

export default function PrivateRepositoryBanner({
  variant = "dashboard",
  message = INACCESSIBLE_PUBLIC_REPO_MESSAGE,
  onTryAnotherRepo,
  onRequireAuth,
}: {
  variant?: "dashboard" | "public" | "inline";
  message?: string;
  onTryAnotherRepo?: () => void;
  onRequireAuth?: () => void;
}) {
  if (variant === "inline") {
    return (
      <div
        role="alert"
        className="mt-2 rounded-xl border border-violet-500/30 bg-violet-500/10 px-3 py-2.5 text-sm leading-relaxed text-violet-100"
      >
        <p className="inline-flex items-start gap-2">
          <Lock
            className="mt-0.5 h-4 w-4 shrink-0 text-violet-300"
            aria-hidden
          />
          <span>{message}</span>
        </p>
      </div>
    );
  }

  if (variant === "public") {
    return (
      <section
        role="alert"
        className="rounded-2xl border border-violet-500/30 bg-violet-500/10 p-6 text-left"
      >
        <p className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-violet-300">
          <Lock className="h-4 w-4" aria-hidden />
          Repository access
        </p>
        <h3 className="mt-3 text-xl font-bold tracking-tight text-textMain">
          Public repository required
        </h3>
        <p className="mt-3 text-sm leading-relaxed text-violet-50/90">
          {message}
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={onRequireAuth}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-brand text-white px-4 py-3 text-sm font-bold tracking-tight transition-colors duration-200 hover:bg-brandHover cursor-pointer sm:flex-1"
          >
            Sign in or create an account
          </button>
          <button
            type="button"
            onClick={onTryAnotherRepo}
            className="inline-flex w-full items-center justify-center rounded-xl border border-border bg-transparent px-4 py-3 text-sm font-bold tracking-tight text-white transition-colors duration-200 hover:bg-white/5 cursor-pointer sm:flex-1"
          >
            Try Another Public Repo
          </button>
        </div>
      </section>
    );
  }

  return (
    <section
      role="alert"
      className="rounded-2xl border border-violet-500/30 bg-violet-500/10 p-5"
    >
      <p className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-violet-300">
        <Lock className="h-4 w-4" aria-hidden />
        Repository access
      </p>
      <h3 className="mt-3 text-lg font-bold tracking-tight text-textMain">
        Public repository required
      </h3>
      <p className="mt-3 text-sm leading-relaxed text-violet-50/90">{message}</p>
      <p className="mt-3 text-sm leading-relaxed text-textMuted">
        Your existing scoreboard was left unchanged. Enable private or enterprise
        work and add an architecture write-up to evaluate NDA-protected projects
        without a public repository URL.
      </p>
    </section>
  );
}
