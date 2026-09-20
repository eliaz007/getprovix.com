"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function DashboardToolError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Dashboard AI tool route error:", error);
  }, [error]);

  return (
    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-6 sm:p-8">
      <p className="text-[10px] uppercase font-bold tracking-wider text-amber-400">
        Tool unavailable
      </p>
      <h1 className="mt-2 text-xl font-extrabold tracking-tight text-textMain">
        This AI tool hit an error
      </h1>
      <p className="mt-2 text-sm text-textMuted leading-relaxed">
        The failure is isolated to this route. Other dashboard tools should still
        navigate normally.
      </p>
      {error.digest ? (
        <p className="mt-2 font-mono text-[11px] text-textMuted">{error.digest}</p>
      ) : null}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => reset()}
          className="inline-flex items-center justify-center rounded-lg border border-border bg-brand px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brandHover cursor-pointer"
        >
          Try again
        </button>
        <Link
          href="/dashboard"
          className="text-sm font-medium text-brand hover:text-brandHover transition-colors"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
