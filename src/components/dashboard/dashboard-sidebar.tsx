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
    return "flex w-full cursor-pointer items-center justify-between rounded-lg bg-white/[0.05] px-3 py-2 font-sans text-sm font-medium tracking-normal text-white transition-colors";
  }
  return "flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 font-sans text-sm font-medium tracking-normal text-zinc-400 transition-colors hover:bg-white/[0.02] hover:text-zinc-200";
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
  consoleBadge = false,
}: {
  badge: string;
  consoleBadge?: boolean;
}) {
  return (
    <div>
      <Link
        href="/"
        className="flex items-center gap-3 transition-opacity hover:opacity-90"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-700/80 bg-zinc-900 text-[11px] font-bold text-white">
          <svg
            viewBox="0 0 36 36"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="h-8 w-8"
            aria-hidden="true"
          >
            <rect width="36" height="36" rx="8" fill="#18181B" stroke="#27272A" strokeWidth="1" />
            <path
              d="M12 25V11H19.5C22.5 11 24.5 13 24.5 16C24.5 19 22.5 21 19.5 21H12"
              stroke="#6366F1"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="18.5" cy="16" r="1.5" fill="#38BDF8" />
          </svg>
        </span>
        <span className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-zinc-100">
          PROVIX
        </span>
      </Link>
      <span
        className={
          consoleBadge
            ? "mt-2 inline-flex w-fit items-center rounded-md border border-violet-500/20 bg-violet-500/10 px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider text-violet-300"
            : "mt-2 inline-flex w-fit items-center rounded-md border border-white/[0.06] bg-white/[0.03] px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider text-zinc-400"
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
      className="h-1.5 w-1.5 shrink-0 rounded-full bg-violet-400 shadow-[0_0_8px_rgba(167,139,250,0.6)]"
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
    <nav aria-label="Dashboard" className="flex flex-col">
      {groups.map((group) => (
        <div key={group.id}>
          <p className="mb-1.5 mt-6 block px-3 font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
            {group.title}
          </p>
          <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
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
          className="w-full cursor-pointer rounded-lg bg-brand px-3 py-2 font-mono text-xs font-semibold text-white shadow-sm transition-colors hover:bg-brandHover"
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
          className="h-1.5 w-1.5 animate-pulse rounded-full bg-violet-400 shadow-[0_0_8px_rgba(124,58,237,0.8)]"
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
        <SidebarBrand badge={badge} consoleBadge={onEmployerSurface} />
        <SidebarNavGroups groups={groups} />
      </div>
      <SidebarFooter />
    </div>
  );
}
