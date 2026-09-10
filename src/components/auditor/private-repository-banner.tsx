"use client";

import { Lock } from "lucide-react";

export default function PrivateRepositoryBanner({
  variant = "dashboard",
  onTryAnotherRepo,
  onRequireAuth,
}: {
  variant?: "dashboard" | "public";
  onTryAnotherRepo?: () => void;
  onRequireAuth?: () => void;
}) {
  if (variant === "public") {
    return (
      <section className="rounded-2xl border border-brand/25 bg-brandGlow p-6 text-left">
        <p className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-brand">
          <Lock className="h-4 w-4" aria-hidden />
          Access
        </p>
        <h3 className="mt-3 text-xl font-bold tracking-tight text-textMain">
          Repository Not Found or Private (HTTP 404)
        </h3>
        <p className="mt-3 text-sm leading-relaxed text-textMuted">
          Public audits inspect open-source GitHub repositories directly. If your
          work is private or enterprise-protected under an NDA, sign in to
          evaluate your architecture write-up inside the candidate dashboard.
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
    <section className="rounded-2xl border border-brand/25 bg-brandGlow p-5">
      <p className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-brand">
        <Lock className="h-4 w-4" aria-hidden />
        Access
      </p>
      <h3 className="mt-3 text-lg font-bold tracking-tight text-textMain">
        Repository Not Found or Private (HTTP 404)
      </h3>
      <p className="mt-3 text-sm leading-relaxed text-textMuted">
        Enable private or enterprise work and add an architecture write-up to
        evaluate NDA-protected projects without a public repository URL.
      </p>
    </section>
  );
}
