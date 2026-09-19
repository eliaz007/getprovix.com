"use client";

import { useState } from "react";
import { handleGitHubSignIn } from "@/lib/github-auth";

const SIGN_IN_BUTTON_CLASS =
  "inline-flex items-center justify-center bg-zinc-900 border border-zinc-800 text-zinc-300 text-xs px-4 py-2 rounded-lg transition-colors duration-200 hover:bg-zinc-800 hover:text-white disabled:cursor-wait disabled:opacity-60 cursor-pointer";

export default function LandingHeaderSignIn() {
  const [loading, setLoading] = useState(false);

  const onSignIn = async () => {
    if (loading) {
      return;
    }

    setLoading(true);
    try {
      const { error } = await handleGitHubSignIn();
      if (error) {
        console.error("GitHub sign-in failed:", error.message);
        setLoading(false);
      }
    } catch (err) {
      console.error(
        "GitHub sign-in failed:",
        err instanceof Error ? err.message : err
      );
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void onSignIn()}
      disabled={loading}
      className={SIGN_IN_BUTTON_CLASS}
    >
      {loading ? "Redirecting..." : "Sign In"}
    </button>
  );
}
