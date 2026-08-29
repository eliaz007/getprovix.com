"use client";

import { GitHubSignInButton } from "@/components/GitHubSignInButton";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";

const HERO_GOOGLE_CLASSES =
  "inline-flex w-full sm:w-auto min-w-[240px] items-center justify-center gap-3 rounded-md bg-white px-8 py-3.5 text-sm font-semibold tracking-tight text-zinc-950 border border-black shadow-[4px_4px_0px_#000] transition-[background-color] duration-200 ease-out hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer";

const HERO_GITHUB_CLASSES =
  "inline-flex w-full sm:w-auto min-w-[240px] items-center justify-center gap-3 rounded-md bg-[#161b22] px-8 py-3.5 text-sm font-semibold tracking-tight text-white border border-black shadow-[4px_4px_0px_#000] transition-[background-color,border-color] duration-200 ease-out hover:bg-[#21262d] disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer";

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
