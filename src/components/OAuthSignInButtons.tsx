"use client";

import { GitHubSignInButton } from "@/components/GitHubSignInButton";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";

const HERO_OAUTH_CLASSES =
  "inline-flex w-full sm:w-auto min-w-[240px] items-center justify-center gap-3 rounded-md bg-panel px-8 py-3.5 text-sm font-medium tracking-tight text-white border border-border transition-colors duration-200 ease-out hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer";

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
        className={size === "hero" ? HERO_OAUTH_CLASSES : undefined}
        onError={onError}
      />
      <GitHubSignInButton
        className={size === "hero" ? HERO_OAUTH_CLASSES : undefined}
        onError={onError}
      />
    </div>
  );
}
