"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ProvixLogo } from "@/components/ProvixLogo";

type VerifyState = "verifying" | "success" | "error";

function errorMessage(code: string | undefined): string {
  if (code === "missing_token") {
    return "This confirmation link is missing a token. Request a new one from Get Verified.";
  }
  if (code === "invalid") {
    return "That confirmation link is invalid or expired. Request a new one from Get Verified.";
  }
  if (code === "unavailable") {
    return "Verification is temporarily unavailable. Try again shortly.";
  }
  return "Could not confirm your work email. Request a new link from Get Verified.";
}

export default function VerifyEmailPage() {
  const router = useRouter();
  const [state, setState] = useState<VerifyState>("verifying");
  const [message, setMessage] = useState("Confirming your work email…");

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const params = new URLSearchParams(window.location.search);
      const token = params.get("token")?.trim() ?? "";

      if (!token) {
        if (!cancelled) {
          setState("error");
          setMessage(errorMessage("missing_token"));
        }
        return;
      }

      try {
        const response = await fetch(
          `/api/employer/verify-email/confirm?token=${encodeURIComponent(token)}`,
          {
            method: "GET",
            headers: { Accept: "application/json" },
            credentials: "same-origin",
          }
        );

        const data = (await response.json().catch(() => null)) as {
          verified?: boolean;
          signedIn?: boolean;
          error?: string;
        } | null;

        if (cancelled) {
          return;
        }

        if (response.ok && data?.verified) {
          setState("success");
          setMessage("Work email confirmed. Redirecting…");
          const destination = data.signedIn
            ? "/dashboard?employer_verified=1"
            : "/login?next=%2Fdashboard&employer_verified=1";
          window.setTimeout(() => {
            router.replace(destination);
          }, 900);
          return;
        }

        setState("error");
        setMessage(errorMessage(data?.error));
      } catch {
        if (!cancelled) {
          setState("error");
          setMessage(errorMessage("update_failed"));
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className="min-h-screen bg-background text-textMain flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-md text-center">
        <div className="flex justify-center mb-8">
          <ProvixLogo className="h-10 w-10" />
        </div>

        {state === "verifying" ? (
          <div
            className="mx-auto mb-6 h-10 w-10 rounded-full border-2 border-border border-t-brand animate-spin"
            aria-hidden="true"
          />
        ) : null}

        <p className="text-xs font-semibold uppercase tracking-widest text-brand mb-3">
          Employer verification
        </p>
        <h1 className="text-2xl font-extrabold tracking-tight text-textMain">
          {state === "verifying"
            ? "Verifying email"
            : state === "success"
              ? "Email verified"
              : "Verification failed"}
        </h1>
        <p
          className={`mt-3 text-sm leading-relaxed ${
            state === "error" ? "text-danger" : "text-textMuted"
          }`}
          role="status"
          aria-live="polite"
        >
          {message}
        </p>

        {state === "error" ? (
          <div className="mt-8 flex flex-col items-center gap-3">
            <Link
              href="/login?next=%2Fdashboard"
              className="inline-flex items-center justify-center rounded-md bg-brand text-white px-4 py-2.5 text-sm font-medium transition-colors hover:bg-brandHover"
            >
              Go to login
            </Link>
            <Link
              href="/"
              className="text-sm text-textMuted hover:text-textMain transition-colors"
            >
              ← Back to Home
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}
