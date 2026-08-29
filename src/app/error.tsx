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
    <div className="min-h-screen bg-[#0A0A0A] text-zinc-100 flex items-center justify-center px-6">
      <div className="card-edge w-full max-w-md rounded-md border border-zinc-700 bg-[#111111] p-8 text-center shadow-[4px_4px_0px_#000]">
        <h1 className="text-2xl font-extrabold tracking-tight text-white">Something went wrong</h1>
        <p className="mt-3 text-sm text-zinc-300 leading-relaxed">
          The page hit an unexpected error. You can try again or go back home.
        </p>
        {error.digest ? (
          <p className="mt-2 font-mono text-[11px] text-zinc-400">
            {error.digest}
          </p>
        ) : null}
        <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Button type="button" onClick={() => retry()}>
            Try again
          </Button>
          <Link
            href="/"
            className="text-sm text-indigo-300 hover:text-indigo-200 font-medium transition-colors duration-200"
          >
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
