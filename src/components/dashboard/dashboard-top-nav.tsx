"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import EmployerNotificationBell from "@/components/EmployerNotificationBell";
import {
  dashboardTabHref,
  isAuditorPath,
  isDashboardAuditorPath,
  isDashboardRootPath,
  isInterviewPrepPath,
  isOpportunitiesPath,
  type DashboardTab,
} from "@/lib/dashboard-account";
import { useDashboardNav } from "@/components/dashboard/dashboard-nav-context";

type NavLinkDef =
  | {
      key: string;
      label: string;
      kind: "tab";
      tab: DashboardTab;
    }
  | {
      key: string;
      label: string;
      kind: "href";
      href: string;
      isActive: (pathname: string) => boolean;
    };

function isNavTabActive(
  tab: DashboardTab,
  pathname: string,
  activeTab: DashboardTab
) {
  if (tab === "opportunities") {
    return (
      isOpportunitiesPath(pathname) ||
      (isDashboardRootPath(pathname) && activeTab === tab)
    );
  }

  if (tab === "auditor") {
    return (
      isDashboardAuditorPath(pathname) ||
      (isDashboardRootPath(pathname) && activeTab === tab)
    );
  }

  return isDashboardRootPath(pathname) && activeTab === tab;
}

function navLinkClass(isActive: boolean) {
  const base =
    "relative inline-flex h-14 shrink-0 items-center text-xs sm:text-sm font-medium transition-colors whitespace-nowrap";
  if (isActive) {
    return `${base} text-zinc-100 font-semibold after:absolute after:bottom-0 after:inset-x-0 after:h-[2px] after:bg-amber-400 after:shadow-[0_0_10px_rgba(245,158,11,0.5)]`;
  }
  return `${base} text-zinc-400 hover:text-zinc-200`;
}

function TopNavLink({
  isActive,
  children,
  onClick,
  href,
}: {
  isActive: boolean;
  children: ReactNode;
  onClick?: () => void;
  href?: string;
}) {
  const className = navLinkClass(isActive);

  if (href) {
    return (
      <Link href={href} onClick={onClick} className={className}>
        {children}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={`${className} cursor-pointer`}>
      {children}
    </button>
  );
}

function buildCandidateLinks(): NavLinkDef[] {
  return [
    { key: "overview", label: "Overview", kind: "tab", tab: "my_profile" },
    {
      key: "talent",
      label: "Talent Network",
      kind: "tab",
      tab: "opportunities",
    },
    {
      key: "intros",
      label: "Intro Requests",
      kind: "tab",
      tab: "intro_requests",
    },
    {
      key: "auditor",
      label: "Auditor",
      kind: "href",
      href: "/dashboard/auditor",
      isActive: isAuditorPath,
    },
    {
      key: "simulator",
      label: "Simulator",
      kind: "href",
      href: "/dashboard/interview-prep",
      isActive: isInterviewPrepPath,
    },
  ];
}

function buildEmployeeLinks(): NavLinkDef[] {
  return [
    {
      key: "network",
      label: "Talent Network",
      kind: "tab",
      tab: "opportunity_radar",
    },
    {
      key: "applications",
      label: "Applications",
      kind: "tab",
      tab: "applications",
    },
  ];
}

function buildEmployerLinks(showTalentPool: boolean): NavLinkDef[] {
  const links: NavLinkDef[] = [
    { key: "overview", label: "Overview", kind: "tab", tab: "my_profile" },
    { key: "applicants", label: "Applicants", kind: "tab", tab: "applicants" },
  ];

  if (showTalentPool) {
    links.push(
      { key: "talent", label: "Talent Network", kind: "tab", tab: "talent" },
      {
        key: "evaluator",
        label: "AI Screen",
        kind: "tab",
        tab: "evaluator",
      },
      { key: "auditor", label: "Auditor", kind: "tab", tab: "auditor" }
    );
  }

  return links;
}

function StatusBadge() {
  const { isGuest, isVerifiedEmployer, isBusinessAccount } = useDashboardNav();

  if (isGuest) {
    return null;
  }

  if (isBusinessAccount && isVerifiedEmployer) {
    return (
      <span className="hidden sm:inline-flex items-center rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-emerald-400">
        Verified
      </span>
    );
  }

  if (!isBusinessAccount) {
    return (
      <span className="hidden sm:inline-flex items-center rounded-full border border-zinc-700/60 bg-zinc-900/80 px-2 py-0.5 text-[10px] font-medium tracking-wide text-zinc-400">
        Member
      </span>
    );
  }

  return (
    <span className="hidden sm:inline-flex items-center rounded-full border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-amber-400">
      Unverified
    </span>
  );
}

function UserAvatar() {
  const {
    isGuest,
    authLoading,
    userAvatarUrl,
    userInitials,
    requireAuth,
  } = useDashboardNav();

  if (authLoading) {
    return (
      <span className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-zinc-800" />
    );
  }

  if (isGuest) {
    return (
      <button
        type="button"
        onClick={() => requireAuth()}
        className="cursor-pointer rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-zinc-100 transition-colors hover:bg-zinc-800"
      >
        Sign In
      </button>
    );
  }

  return (
    <Link
      href="/dashboard"
      aria-label="Open your profile"
      className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-zinc-700/80 bg-zinc-900 text-[10px] font-bold text-zinc-100 transition-colors hover:border-zinc-500"
    >
      {userAvatarUrl ? (
        <img
          src={userAvatarUrl}
          alt=""
          className="h-full w-full object-cover"
        />
      ) : (
        userInitials
      )}
    </Link>
  );
}

export default function DashboardTopNav() {
  const pathname = usePathname();
  const {
    activeTab,
    setActiveTab,
    isGuest,
    isBusinessAccount,
    isEmployeeAccount,
    showTalentPoolNav,
    userId,
    onOpenJobApplicants,
    requireAuth,
  } = useDashboardNav();

  const links = isBusinessAccount
    ? buildEmployerLinks(showTalentPoolNav)
    : isEmployeeAccount
      ? buildEmployeeLinks()
      : buildCandidateLinks();

  const selectTab = (tab: DashboardTab) => {
    if (isGuest) {
      requireAuth();
      return;
    }
    setActiveTab(tab);
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/[0.08] bg-[#0B0B0D]/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 sm:gap-6 sm:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-1 sm:gap-2">
          <Link
            href="/"
            className="flex shrink-0 items-center gap-2.5 transition-opacity hover:opacity-90"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-md border border-zinc-700/80 bg-zinc-900 text-[11px] font-bold text-white">
              P
            </span>
            <span className="hidden text-xs font-bold tracking-widest text-zinc-100 sm:inline">
              PROVIX
            </span>
          </Link>

          <span
            className="mx-2 hidden h-4 w-px shrink-0 bg-zinc-800 sm:block"
            aria-hidden
          />

          <nav
            aria-label="Dashboard"
            className="flex min-w-0 flex-1 items-center gap-3 overflow-x-auto sm:gap-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {links.map((item) => {
              if (item.kind === "href") {
                const active = item.isActive(pathname);
                return (
                  <TopNavLink
                    key={item.key}
                    href={isGuest ? undefined : item.href}
                    isActive={active}
                    onClick={
                      isGuest
                        ? () => requireAuth()
                        : undefined
                    }
                  >
                    {item.label}
                  </TopNavLink>
                );
              }

              const active = isNavTabActive(item.tab, pathname, activeTab);
              const href =
                item.tab === "my_profile" && isBusinessAccount
                  ? "/dashboard?tab=my_profile"
                  : dashboardTabHref(item.tab);

              if (item.tab === "opportunities") {
                return (
                  <TopNavLink
                    key={item.key}
                    href={dashboardTabHref(item.tab)}
                    isActive={active}
                  >
                    {item.label}
                  </TopNavLink>
                );
              }

              if (isGuest) {
                return (
                  <TopNavLink
                    key={item.key}
                    isActive={active}
                    onClick={() => requireAuth()}
                  >
                    {item.label}
                  </TopNavLink>
                );
              }

              if (isDashboardRootPath(pathname)) {
                return (
                  <TopNavLink
                    key={item.key}
                    isActive={active}
                    onClick={() => selectTab(item.tab)}
                  >
                    {item.label}
                  </TopNavLink>
                );
              }

              return (
                <TopNavLink
                  key={item.key}
                  href={href}
                  isActive={active}
                  onClick={() => selectTab(item.tab)}
                >
                  {item.label}
                </TopNavLink>
              );
            })}
          </nav>
        </div>

        <div className="flex shrink-0 items-center gap-2.5 sm:gap-3">
          {!isGuest && isBusinessAccount ? (
            <EmployerNotificationBell
              userId={userId}
              onOpenJobApplicants={(jobId) => onOpenJobApplicants?.(jobId)}
            />
          ) : null}
          <StatusBadge />
          <UserAvatar />
        </div>
      </div>
    </header>
  );
}
