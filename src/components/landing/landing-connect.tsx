"use client";

import { useState } from "react";
import { GitHubSignInButton } from "@/components/GitHubSignInButton";
import { MotionButton } from "@/components/landing/landing-motion";
import ConnectRepositoryButton from "@/components/onboarding/connect-repository-button";

const COMMAND = "npx provix@latest";

export default function LandingConnect() {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  async function copyCommand() {
    try {
      await navigator.clipboard.writeText(COMMAND);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
        <ConnectRepositoryButton />
        <GitHubSignInButton
          label="Connect with GitHub"
          nextPath="/onboarding"
          onError={setError}
          className="inline-flex items-center justify-center gap-2.5 rounded-lg bg-purple-600 px-5 py-3 text-sm font-semibold text-white shadow-[0_0_32px_-8px_rgba(147,51,234,0.95)] transition-[background-color,transform,box-shadow] hover:bg-purple-500 hover:shadow-[0_0_40px_-6px_rgba(147,51,234,1)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
        />
        <div className="flex min-w-0 items-center gap-2 rounded-lg border border-white/10 bg-black/70 px-3 py-2.5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] backdrop-blur-md transition-colors hover:border-white/15">
          <p className="min-w-0 truncate font-mono text-[13px] text-[#f9fafb]">
            <span className="text-purple-400">$ </span>
            {COMMAND}
          </p>
          <MotionButton
            type="button"
            onClick={() => void copyCommand()}
            className="shrink-0 rounded-md px-2 py-1 font-mono text-[11px] text-purple-300 transition-colors hover:bg-purple-500/10 hover:text-purple-200"
          >
            {copied ? "Copied" : "Copy"}
          </MotionButton>
        </div>
      </div>
      {error ? (
        <p className="font-mono text-xs text-rose-300" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
