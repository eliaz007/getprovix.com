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
    <header className="flex md:hidden items-center justify-between gap-3 px-4 py-3 bg-[#111111] border-b border-zinc-800 shrink-0 z-20">
      <div className="flex items-center gap-2 min-w-0">
        <button
          type="button"
          onClick={onOpenMenu}
          aria-label="Open navigation menu"
          className="p-2 -ml-1 rounded-lg text-zinc-200 hover:bg-zinc-800 hover:text-white transition-colors duration-200 ease-out cursor-pointer"
        >
          <DashboardIcons.Menu />
        </button>
        <Link href="/" className="min-w-0 hover:opacity-90 transition-opacity">
          <ProvixLogo />
        </Link>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {trailing}
        {authLoading ? null : isGuest ? (
          <button
            type="button"
            onClick={onSignIn}
            className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold tracking-tight px-4 py-2 rounded-md transition-colors duration-200 ease-out cursor-pointer"
          >
            {signInLabel}
          </button>
        ) : (
          <Link
            href="/dashboard"
            aria-label="Open your profile"
            className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-zinc-600 bg-zinc-800 text-[11px] font-bold text-white hover:border-indigo-400 transition-colors duration-200 ease-out"
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
