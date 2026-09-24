"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ProvixLogo } from "@/components/ProvixLogo";
import { DashboardIcons } from "@/components/dashboard/dashboard-icons";
import { isOpportunitiesPath } from "@/lib/dashboard-account";

export default function MobileAppHeader({
  onOpenMenu,
  onSignIn,
  isGuest,
  authLoading = false,
  avatarUrl = null,
  initials = "U",
  trailing = null,
}: {
  onOpenMenu: () => void;
  onSignIn?: () => void;
  isGuest: boolean;
  authLoading?: boolean;
  avatarUrl?: string | null;
  initials?: string;
  trailing?: ReactNode;
}) {
  const pathname = usePathname();
  const signInLabel = isOpportunitiesPath(pathname)
    ? "Sign in to get matched"
    : "Sign In";

  return (
    <header className="z-20 flex shrink-0 items-center justify-between gap-3 border-b border-white/[0.08] bg-[#0E0E12] px-4 py-3 md:hidden">
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={onOpenMenu}
          aria-label="Open navigation menu"
          className="cursor-pointer rounded-lg p-2 -ml-1 text-zinc-100 transition-colors duration-200 ease-out hover:bg-[#1A1A1E] hover:text-zinc-200"
        >
          <DashboardIcons.Menu />
        </button>
        <Link href="/" className="min-w-0 transition-opacity hover:opacity-90">
          <ProvixLogo />
        </Link>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {trailing}
        {authLoading ? null : isGuest ? (
          <button
            type="button"
            onClick={onSignIn}
            className="cursor-pointer rounded-md bg-[#F4F4F6] px-4 py-2 text-xs font-semibold tracking-tight text-[#0B0B0D] transition-colors duration-200 ease-out hover:bg-white"
          >
            {signInLabel}
          </button>
        ) : (
          <Link
            href="/dashboard"
            aria-label="Open your profile"
            className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-white/[0.08] bg-[#131316] text-[11px] font-bold text-zinc-100 transition-colors duration-200 ease-out hover:border-indigo-400"
          >
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              initials
            )}
          </Link>
        )}
      </div>
    </header>
  );
}
