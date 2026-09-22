"use client";

import Link from "next/link";
import {
  LayoutDashboard,
  Users,
  Send,
  ShieldCheck,
  Terminal,
  Settings,
} from "lucide-react";
import { usePathname } from "next/navigation";
import EmployerNotificationBell from "@/components/EmployerNotificationBell";
import {
  isAuditorPath,
  isDashboardRootPath,
  isInterviewPrepPath,
  isOpportunitiesPath,
  type DashboardTab,
} from "@/lib/dashboard-account";
import { useDashboardNav } from "@/components/dashboard/dashboard-nav-context";

type IslandItem = {
  key: string;
  label: string;
  shortLabel: string;
  href: string;
  icon: typeof LayoutDashboard;
  isActive: (pathname: string, activeTab: DashboardTab) => boolean;
};

const CANDIDATE_ISLAND: IslandItem[] = [
  {
    key: "overview",
    label: "Overview",
    shortLabel: "Overview",
    href: "/dashboard",
    icon: LayoutDashboard,
    isActive: (pathname, activeTab) =>
      isDashboardRootPath(pathname) && activeTab === "my_profile",
  },
  {
    key: "talent",
    label: "Talent Network",
    shortLabel: "Talent",
    href: "/dashboard/talent",
    icon: Users,
    isActive: (pathname, activeTab) =>
      isOpportunitiesPath(pathname) ||
      pathname === "/dashboard/talent" ||
      pathname.startsWith("/dashboard/talent/") ||
      (isDashboardRootPath(pathname) && activeTab === "opportunities"),
  },
  {
    key: "intros",
    label: "Intro Requests",
    shortLabel: "Intros",
    href: "/dashboard/requests",
    icon: Send,
    isActive: (pathname, activeTab) =>
      pathname === "/dashboard/requests" ||
      pathname.startsWith("/dashboard/requests/") ||
      (isDashboardRootPath(pathname) && activeTab === "intro_requests"),
  },
  {
    key: "auditor",
    label: "Auditor",
    shortLabel: "Auditor",
    href: "/dashboard/auditor",
    icon: ShieldCheck,
    isActive: (pathname) => isAuditorPath(pathname),
  },
  {
    key: "simulator",
    label: "Simulator",
    shortLabel: "Simulator",
    href: "/dashboard/simulator",
    icon: Terminal,
    isActive: (pathname) =>
      isInterviewPrepPath(pathname) ||
      pathname === "/dashboard/simulator" ||
      pathname.startsWith("/dashboard/simulator/"),
  },
];

const EMPLOYER_ISLAND: IslandItem[] = [
  {
    key: "overview",
    label: "Overview",
    shortLabel: "Overview",
    href: "/dashboard?tab=my_profile",
    icon: LayoutDashboard,
    isActive: (pathname, activeTab) =>
      isDashboardRootPath(pathname) && activeTab === "my_profile",
  },
  {
    key: "applicants",
    label: "Applicants",
    shortLabel: "Applicants",
    href: "/dashboard?tab=applicants",
    icon: Send,
    isActive: (pathname, activeTab) =>
      isDashboardRootPath(pathname) && activeTab === "applicants",
  },
  {
    key: "talent",
    label: "Talent Network",
    shortLabel: "Talent",
    href: "/dashboard?tab=talent",
    icon: Users,
    isActive: (pathname, activeTab) =>
      isDashboardRootPath(pathname) && activeTab === "talent",
  },
  {
    key: "auditor",
    label: "Auditor",
    shortLabel: "Auditor",
    href: "/dashboard/auditor",
    icon: ShieldCheck,
    isActive: (pathname, activeTab) =>
      isAuditorPath(pathname) ||
      (isDashboardRootPath(pathname) && activeTab === "auditor"),
  },
];

const EMPLOYEE_ISLAND: IslandItem[] = [
  {
    key: "talent",
    label: "Talent Network",
    shortLabel: "Talent",
    href: "/dashboard?tab=opportunity_radar",
    icon: Users,
    isActive: (pathname, activeTab) =>
      isDashboardRootPath(pathname) && activeTab === "opportunity_radar",
  },
  {
    key: "applications",
    label: "Applications",
    shortLabel: "Apps",
    href: "/dashboard?tab=applications",
    icon: Send,
    isActive: (pathname, activeTab) =>
      isDashboardRootPath(pathname) && activeTab === "applications",
  },
];

function islandItemClass(isActive: boolean) {
  const base =
    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[11px] sm:text-xs font-medium transition-all whitespace-nowrap";
  if (isActive) {
    return `${base} border border-purple-500/40 bg-purple-500/15 text-white shadow-[0_0_12px_rgba(168,85,247,0.25)]`;
  }
  return `${base} border border-transparent text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-200`;
}

function ProvixMark({
  className = "h-8 w-8",
  alt = "Provix",
}: {
  className?: string;
  alt?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/brand/provix-mark.jpg"
      alt={alt}
      className={`rounded-[22%] object-cover ${className}`}
    />
  );
}

function BrandMark() {
  return (
    <Link
      href="/"
      className="flex shrink-0 items-center gap-2.5 transition-opacity hover:opacity-90"
    >
      <ProvixMark className="h-7 w-7" alt="" />
      <span className="hidden text-sm font-bold tracking-widest text-zinc-100 sm:inline">
        PROVIX
      </span>
    </Link>
  );
}

function RoleBadge() {
  const {
    isGuest,
    authLoading,
    isBusinessAccount,
    isVerifiedEmployer,
  } = useDashboardNav();

  if (authLoading) {
    return (
      <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[10px] font-semibold tracking-wide text-zinc-500">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-zinc-600" />
        Loading
      </span>
    );
  }

  if (isGuest) {
    return null;
  }

  if (isBusinessAccount) {
    return (
      <span
        className={`hidden sm:inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold tracking-wide ${
          isVerifiedEmployer
            ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
            : "border-purple-500/30 bg-purple-500/10 text-purple-200"
        }`}
      >
        <span
          className={`h-1.5 w-1.5 animate-pulse rounded-full ${
            isVerifiedEmployer ? "bg-emerald-400" : "bg-purple-400"
          }`}
        />
        Employer
      </span>
    );
  }

  return (
    <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold tracking-wide text-emerald-300">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
      Developer
    </span>
  );
}

function TopRightBrandButton() {
  const { isGuest, authLoading, requireAuth } = useDashboardNav();

  if (authLoading) {
    return (
      <span className="h-8 w-8 shrink-0 animate-pulse rounded-[22%] bg-zinc-800" />
    );
  }

  if (isGuest) {
    return (
      <button
        type="button"
        onClick={() => requireAuth()}
        className="cursor-pointer rounded-full border border-white/[0.08] bg-[#14141b] px-3 py-1.5 text-xs font-semibold text-zinc-100 transition-colors hover:bg-white/[0.06]"
      >
        Sign In
      </button>
    );
  }

  return (
    <Link
      href="/dashboard/profile"
      aria-label="Open your profile"
      className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-[22%] border border-amber-500/25 transition-opacity hover:opacity-90"
    >
      <ProvixMark className="h-8 w-8" alt="" />
    </Link>
  );
}

function IslandNav({
  items,
  pathname,
  activeTab,
  isGuest,
  requireAuth,
}: {
  items: IslandItem[];
  pathname: string;
  activeTab: DashboardTab;
  isGuest: boolean;
  requireAuth: () => boolean;
}) {
  return (
    <div className="flex items-center gap-0.5 rounded-full border border-white/[0.08] bg-[#14141b]/90 p-1 shadow-inner backdrop-blur-md">
      {items.map((item) => {
        const Icon = item.icon;
        const active = item.isActive(pathname, activeTab);
        const className = islandItemClass(active);

        const content = (
          <>
            <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="sm:hidden">{item.shortLabel}</span>
            <span className="hidden sm:inline">{item.label}</span>
          </>
        );

        if (isGuest) {
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => requireAuth()}
              className={`${className} cursor-pointer`}
              aria-current={active ? "page" : undefined}
              title={item.label}
            >
              {content}
            </button>
          );
        }

        return (
          <Link
            key={item.key}
            href={item.href}
            className={className}
            aria-current={active ? "page" : undefined}
            title={item.label}
          >
            {content}
          </Link>
        );
      })}
    </div>
  );
}

export default function DashboardTopNav() {
  const pathname = usePathname();
  const {
    activeTab,
    isGuest,
    isBusinessAccount,
    isEmployeeAccount,
    showTalentPoolNav,
    userId,
    onOpenJobApplicants,
    requireAuth,
  } = useDashboardNav();

  const items = isBusinessAccount
    ? showTalentPoolNav
      ? EMPLOYER_ISLAND
      : EMPLOYER_ISLAND.filter(
          (item) => item.key === "overview" || item.key === "applicants"
        )
    : isEmployeeAccount
      ? EMPLOYEE_ISLAND
      : CANDIDATE_ISLAND;

  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/[0.07] bg-[#0c0c10]/80 backdrop-blur-xl">
      <div className="relative mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:gap-4 sm:px-6">
        <BrandMark />

        <nav
          aria-label="Dashboard"
          className="absolute left-1/2 top-1/2 hidden max-w-[min(100%,42rem)] -translate-x-1/2 -translate-y-1/2 md:block"
        >
          <IslandNav
            items={items}
            pathname={pathname}
            activeTab={activeTab}
            isGuest={isGuest}
            requireAuth={requireAuth}
          />
        </nav>

        <nav
          aria-label="Dashboard mobile"
          className="min-w-0 flex-1 overflow-x-auto md:hidden [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <div className="mx-auto w-max">
            <IslandNav
              items={items}
              pathname={pathname}
              activeTab={activeTab}
              isGuest={isGuest}
              requireAuth={requireAuth}
            />
          </div>
        </nav>

        <div className="flex shrink-0 items-center gap-2 sm:gap-2.5">
          {!isGuest && isBusinessAccount ? (
            <EmployerNotificationBell
              userId={userId}
              onOpenJobApplicants={(jobId) => onOpenJobApplicants?.(jobId)}
            />
          ) : null}
          <RoleBadge />
          {!isGuest ? (
            <Link
              href="/dashboard/settings"
              aria-label="Open settings"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.08] bg-[#14141b]/80 text-zinc-400 transition-colors hover:bg-white/[0.05] hover:text-zinc-200"
            >
              <Settings className="h-4 w-4" aria-hidden />
            </Link>
          ) : null}
          <TopRightBrandButton />
        </div>
      </div>
    </header>
  );
}
