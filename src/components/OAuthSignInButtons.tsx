"use client";

import { GitHubSignInButton } from "@/components/GitHubSignInButton";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";

const HERO_GOOGLE_CLASSES =
  "inline-flex w-full sm:w-auto min-w-[240px] items-center justify-center gap-3 rounded-lg bg-white px-8 py-3.5 text-sm font-semibold text-zinc-900 shadow-sm transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer";

const HERO_GITHUB_CLASSES =
  "inline-flex w-full sm:w-auto min-w-[240px] items-center justify-center gap-3 rounded-lg bg-[#161b22] px-8 py-3.5 text-sm font-semibold text-white border border-zinc-700 shadow-sm transition-colors hover:bg-[#21262d] hover:border-zinc-600 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer";

export function OAuthSignInButtons({
  onError,
  layout = "stack",
  size = "default",
}: {
  onError?: (message: string) => void;
  layout?: "stack" | "responsive";
  size?: "default" | "hero";
}) {
  const layoutClass =
    layout === "responsive"
      ? "flex w-full flex-col gap-3 sm:flex-row sm:justify-center"
      : "flex w-full flex-col gap-3";

  return (
    <div className={layoutClass}>
      <GoogleSignInButton
        className={size === "hero" ? HERO_GOOGLE_CLASSES : undefined}
        onError={onError}
      />
      <GitHubSignInButton
        className={size === "hero" ? HERO_GITHUB_CLASSES : undefined}
        onError={onError}
      />
    </div>
  );
}
