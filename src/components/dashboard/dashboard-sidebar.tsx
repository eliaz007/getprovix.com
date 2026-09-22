"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Send,
  ShieldCheck,
  Terminal,
  Briefcase,
  Bookmark,
  Building2,
  GitBranch,
  Settings,
  Search,
  type LucideIcon,
} from "lucide-react";
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

type NavItemDef =
  | {
      key: string;
      label: string;
      icon: LucideIcon;
      kind: "tab";
      tab: DashboardTab;
    }
  | {
      key: string;
      label: string;
      icon: LucideIcon;
      kind: "href";
      href: string;
      isActive: (pathname: string, activeTab: DashboardTab) => boolean;
    };

type NavGroup = {
  id: string;
  title: string;
  items: NavItemDef[];
};

function isEmployerPath(pathname: string) {
  return pathname === "/employer" || pathname.startsWith("/employer/");
}

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

function navItemClass(isActive: boolean) {
  if (isActive) {
    return "flex w-full items-center justify-between gap-3 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 font-mono text-xs font-medium text-zinc-100 transition-colors cursor-pointer";
  }
  return "flex w-full items-center gap-3 rounded-lg border border-transparent px-3 py-2 font-mono text-xs text-zinc-400 transition-colors hover:bg-white/[0.03] hover:text-zinc-200 cursor-pointer";
}

function buildCandidateGroups(): NavGroup[] {
  return [
    {
      id: "platform",
      title: "PLATFORM",
      items: [
        {
          key: "overview",
          label: "Overview",
          icon: LayoutDashboard,
          kind: "tab",
          tab: "my_profile",
        },
        {
          key: "auditor",
          label: "Auditor",
          icon: ShieldCheck,
          kind: "href",
          href: "/dashboard/auditor",
          isActive: (pathname) => isAuditorPath(pathname),
        },
        {
          key: "simulator",
          label: "Simulator",
          icon: Terminal,
          kind: "href",
          href: "/dashboard/simulator",
          isActive: (pathname) => isInterviewPrepPath(pathname),
        },
      ],
    },
    {
      id: "matching",
      title: "MATCHING",
      items: [
        {
          key: "talent",
          label: "Talent Network",
          icon: Users,
          kind: "tab",
          tab: "opportunities",
        },
        {
          key: "intros",
          label: "Intro Requests",
          icon: Send,
          kind: "tab",
          tab: "intro_requests",
        },
      ],
    },
  ];
}

function buildEmployerGroups(): NavGroup[] {
  return [
    {
      id: "talent-discovery",
      title: "TALENT DISCOVERY",
      items: [
        {
          key: "candidates",
          label: "Candidates / Search",
          icon: Search,
          kind: "href",
          href: "/employer/talent",
          isActive: (pathname, activeTab) =>
            pathname === "/employer/talent" ||
            pathname.startsWith("/employer/talent/") ||
            pathname === "/search" ||
            pathname.startsWith("/search/") ||
            (isDashboardRootPath(pathname) && activeTab === "talent"),
        },
        {
          key: "shortlisted",
          label: "Shortlisted",
          icon: Bookmark,
          kind: "href",
          href: "/employer/saved",
          isActive: (pathname, activeTab) =>
            pathname === "/employer/saved" ||
            pathname.startsWith("/employer/saved/") ||
            (isDashboardRootPath(pathname) && activeTab === "evaluator"),
        },
        {
          key: "outbound",
          label: "Outbound Requests",
          icon: Send,
          kind: "href",
          href: "/employer/requests",
          isActive: (pathname, activeTab) =>
            pathname === "/employer/requests" ||
            pathname.startsWith("/employer/requests/") ||
            pathname === "/employer/outreach" ||
            pathname.startsWith("/employer/outreach/") ||
            (isDashboardRootPath(pathname) && activeTab === "applicants"),
        },
      ],
    },
    {
      id: "organization",
      title: "ORGANIZATION",
      items: [
        {
          key: "company",
          label: "Company Profile",
          icon: Building2,
          kind: "href",
          href: "/employer/profile",
          isActive: (pathname, activeTab) =>
            pathname === "/employer/profile" ||
            pathname.startsWith("/employer/profile/") ||
            (isDashboardRootPath(pathname) && activeTab === "my_profile"),
        },
        {
          key: "pipeline",
          label: "Hiring Pipeline",
          icon: GitBranch,
          kind: "href",
          href: "/employer/pipeline",
          isActive: (pathname) =>
            pathname === "/employer/pipeline" ||
            pathname.startsWith("/employer/pipeline/"),
        },
        {
          key: "settings",
          label: "Billing / Settings",
          icon: Settings,
          kind: "href",
          href: "/employer/settings",
          isActive: (pathname) =>
            pathname === "/employer/settings" ||
            pathname.startsWith("/employer/settings/"),
        },
      ],
    },
  ];
}

function buildEmployeeGroups(): NavGroup[] {
  return [
    {
      id: "matching",
      title: "MATCHING",
      items: [
        {
          key: "talent",
          label: "Talent Network",
          icon: Users,
          kind: "tab",
          tab: "opportunity_radar",
        },
        {
          key: "applications",
          label: "Applications",
          icon: Briefcase,
          kind: "tab",
          tab: "applications",
        },
      ],
    },
  ];
}

function SidebarBrand({
  badge,
  amberBadge = false,
}: {
  badge: string;
  amberBadge?: boolean;
}) {
  return (
    <div>
      <Link
        href="/"
        className="flex items-center gap-3 transition-opacity hover:opacity-90"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/provix-mark.jpg"
          alt=""
          className="h-8 w-8 rounded-[22%] object-cover"
        />
        <span className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-zinc-100">
          PROVIX
        </span>
      </Link>
      <span
        className={
          amberBadge
            ? "mt-2 inline-block rounded-md border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-amber-400/90"
            : "mt-2 inline-block rounded-md border border-white/[0.05] bg-white/[0.02] px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-zinc-500"
        }
      >
        {badge}
      </span>
    </div>
  );
}

function NavItemRow({
  item,
  isActive,
}: {
  item: NavItemDef;
  isActive: boolean;
}) {
  const pathname = usePathname();
  const {
    setActiveTab,
    setMobileNavOpen,
    isGuest,
    isBusinessAccount,
    requireAuth,
  } = useDashboardNav();

  const Icon = item.icon;
  const className = navItemClass(isActive);

  const body = (
    <span className="flex min-w-0 items-center gap-3">
      <Icon className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
      <span className="truncate">{item.label}</span>
    </span>
  );

  const trailing = isActive ? (
    <span
      aria-hidden
      className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.8)]"
    />
  ) : null;

  const closeMobile = () => setMobileNavOpen(false);

  if (isGuest) {
    return (
      <button
        type="button"
        onClick={() => {
          closeMobile();
          requireAuth();
        }}
        className={className}
        aria-current={isActive ? "page" : undefined}
      >
        {body}
        {trailing}
      </button>
    );
  }

  if (item.kind === "href") {
    return (
      <Link
        href={item.href}
        onClick={closeMobile}
        className={className}
        aria-current={isActive ? "page" : undefined}
      >
        {body}
        {trailing}
      </Link>
    );
  }

  const tabHref =
    item.tab === "my_profile" && isBusinessAccount
      ? "/dashboard?tab=my_profile"
      : dashboardTabHref(item.tab);

  const selectTab = () => {
    setActiveTab(item.tab);
    closeMobile();
  };

  if (item.tab === "opportunities") {
    return (
      <Link
        href={dashboardTabHref(item.tab)}
        onClick={closeMobile}
        className={className}
        aria-current={isActive ? "page" : undefined}
      >
        {body}
        {trailing}
      </Link>
    );
  }

  if (isDashboardRootPath(pathname) && !isEmployerPath(pathname)) {
    return (
      <button
        type="button"
        onClick={selectTab}
        className={className}
        aria-current={isActive ? "page" : undefined}
      >
        {body}
        {trailing}
      </button>
    );
  }

  return (
    <Link
      href={tabHref}
      onClick={selectTab}
      className={className}
      aria-current={isActive ? "page" : undefined}
    >
      {body}
      {trailing}
    </Link>
  );
}

function SidebarNavGroups({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname();
  const { activeTab } = useDashboardNav();

  return (
    <nav aria-label="Dashboard" className="mt-6 flex flex-col gap-1">
      {groups.map((group) => (
        <div key={group.id} className="mb-4 last:mb-0">
          <p className="px-3 py-2 font-mono text-[9px] uppercase tracking-widest text-zinc-600">
            {group.title}
          </p>
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {group.items.map((item) => {
              const isActive =
                item.kind === "href"
                  ? item.isActive(pathname, activeTab)
                  : isNavTabActive(item.tab, pathname, activeTab);

              return (
                <li key={item.key}>
                  <NavItemRow item={item} isActive={isActive} />
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function SidebarFooter() {
  const {
    isGuest,
    authLoading,
    userAvatarUrl,
    userInitials,
    userDisplayName,
    requireAuth,
    setMobileNavOpen,
  } = useDashboardNav();

  if (authLoading) {
    return (
      <div className="mt-auto flex items-center justify-between border-t border-white/[0.06] pt-4 font-mono text-xs">
        <span className="h-8 w-full animate-pulse rounded-md bg-white/[0.04]" />
      </div>
    );
  }

  if (isGuest) {
    return (
      <div className="mt-auto border-t border-white/[0.06] pt-4">
        <button
          type="button"
          onClick={() => {
            setMobileNavOpen(false);
            requireAuth();
          }}
          className="w-full cursor-pointer rounded-lg bg-[#F4F4F6] px-3 py-2 font-mono text-xs font-semibold text-[#0B0B0D] shadow-sm transition-colors hover:bg-white"
        >
          Sign In
        </button>
      </div>
    );
  }

  const handle = userDisplayName.trim().startsWith("@")
    ? userDisplayName.trim()
    : `@${userDisplayName.trim().toLowerCase().replace(/\s+/g, "") || "user"}`;

  return (
    <div className="mt-auto flex items-center justify-between gap-3 border-t border-white/[0.06] pt-4 font-mono text-xs">
      <div className="flex min-w-0 items-center gap-2.5">
        {userAvatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={userAvatarUrl}
            alt=""
            className="h-7 w-7 shrink-0 rounded-full object-cover"
          />
        ) : (
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.04] text-[10px] font-semibold text-zinc-300">
            {userInitials}
          </span>
        )}
        <span className="truncate text-zinc-300">{handle}</span>
      </div>
      <span className="inline-flex shrink-0 items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-zinc-400">
        <span
          aria-hidden
          className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.8)]"
        />
        Live
      </span>
    </div>
  );
}

export default function DashboardSidebar() {
  const pathname = usePathname();
  const { isBusinessAccount, isEmployeeAccount } = useDashboardNav();

  const onEmployerSurface =
    isBusinessAccount || isEmployerPath(pathname);

  const groups = onEmployerSurface
    ? buildEmployerGroups()
    : isEmployeeAccount
      ? buildEmployeeGroups()
      : buildCandidateGroups();

  const badge = onEmployerSurface
    ? "EMPLOYER CONSOLE"
    : isEmployeeAccount
      ? "Employee Workspace"
      : "Candidate Workspace";

  return (
    <div className="flex h-full min-h-0 w-64 shrink-0 flex-col justify-between border-r border-white/[0.08] bg-[#0E0E12] p-5">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <SidebarBrand badge={badge} amberBadge={onEmployerSurface} />
        <SidebarNavGroups groups={groups} />
      </div>
      <SidebarFooter />
    </div>
  );
}
