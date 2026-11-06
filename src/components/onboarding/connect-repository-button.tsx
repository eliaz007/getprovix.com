"use client";

import { useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { handleGitHubSignIn } from "@/lib/github-auth";
import { workspaceEntryPath } from "@/lib/workspace-entry";

/** Full GitHub + AST onboarding (split-screen login, App install, first audit). */
const ONBOARDING_PATH = "/onboarding";

function hardNavigate(path: string) {
  try {
    window.location.assign(path);
  } catch {
    window.location.href = path;
  }
}

/**
 * Landing / banner CTA: start GitHub auth when signed out, then land on
 * /onboarding. Soft client transitions can leave Next's RSC channel open;
 * hard navigation keeps the overlay clickable after OAuth.
 */
export default function ConnectRepositoryButton({
  label = "Connect Repo",
  variant = "default",
  className,
}: {
  label?: string;
  variant?: "default" | "editorial";
  className?: string;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function connect() {
    if (pending) return;
    setPending(true);
    setError("");

    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        hardNavigate(await workspaceEntryPath());
        return;
      }

      const { data, error: authError } = await handleGitHubSignIn(ONBOARDING_PATH);
      if (authError) {
        setError(authError.message);
        setPending(false);
        return;
      }
      if (data?.url) {
        hardNavigate(data.url);
        return;
      }

      setError("GitHub did not return a sign-in URL.");
      setPending(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "GitHub sign-in failed.");
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => void connect()}
        disabled={pending}
        className={
          className ??
          (variant === "editorial"
            ? "inline-flex items-center justify-center gap-2 rounded-md bg-[#7c3aed] px-6 py-3.5 text-sm font-medium text-white transition-colors hover:bg-[#6d28d9] disabled:cursor-wait disabled:opacity-70"
            : "inline-flex items-center justify-center rounded-lg bg-zinc-100 px-4 py-2.5 font-mono text-sm font-semibold text-zinc-950 transition-colors hover:bg-zinc-200 disabled:cursor-wait disabled:opacity-70")
        }
      >
        {pending ? "Connecting…" : label}
        {!className && variant === "editorial" && !pending ? (
          <span className="font-mono" aria-hidden="true">[-&gt;]</span>
        ) : null}
      </button>
      {error ? (
        <p className="font-mono text-xs text-[#EF4444]" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
