"use client";

import { useEffect } from "react";
import Link from "next/link";
import Button from "@/components/ui/Button";

export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("App error boundary:", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-background text-textMain flex items-center justify-center px-6">
      <div className="card-edge w-full max-w-md rounded-md border border-border bg-panel p-8 text-center">
        <h1 className="text-2xl font-extrabold tracking-tight text-textMain">Something went wrong</h1>
        <p className="mt-3 text-sm text-textMuted leading-relaxed">
          The page hit an unexpected error. You can try again or go back home.
        </p>
        {error.digest ? (
          <p className="mt-2 font-mono text-[11px] text-textMuted">
            {error.digest}
          </p>
        ) : null}
        <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Button type="button" onClick={() => retry()}>
            Try again
          </Button>
          <Link
            href="/"
            className="text-sm text-brand hover:text-brand font-medium transition-colors duration-200"
          >
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
