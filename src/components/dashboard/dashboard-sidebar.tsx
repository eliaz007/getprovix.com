"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { ShieldCheck, Terminal } from "lucide-react";
import {
  dashboardTabHref,
  isAuditorPath,
  isDashboardAuditorPath,
  isDashboardRootPath,
  isInterviewPrepPath,
  isOpportunitiesPath,
  type DashboardTab,
} from "@/lib/dashboard-account";
import { DashboardIcons } from "@/components/dashboard/dashboard-icons";
import { useDashboardNav } from "@/components/dashboard/dashboard-nav-context";

const ALIGN_X = "px-2.5";
const navListClass = "m-0 flex list-none flex-col gap-0.5 p-0";
const navItemShellClass = "order-none w-full shrink-0";
const sectionHeaderClass = `${ALIGN_X} text-[10px] font-mono uppercase tracking-widest text-zinc-500 font-semibold mb-1.5 block`;

/** Approx. zinc-850 — between zinc-800 and zinc-900 (not in default Tailwind). */
const ACTIVE_PILL =
  "bg-[#1f1f22]/90 text-zinc-100 border border-zinc-700/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]";
const INACTIVE_ITEM = "text-zinc-400 border-transparent hover:text-zinc-200 hover:bg-zinc-900/60";

function navItemClass(isActive: boolean) {
  return `w-full text-left ${ALIGN_X} py-1.5 rounded-md text-xs font-medium flex items-center gap-2.5 transition-all cursor-pointer border ${
    isActive ? ACTIVE_PILL : INACTIVE_ITEM
  }`;
}

type NavVisibility = {
  isBusinessAccount: boolean;
  isEmployeeAccount: boolean;
  isGuest: boolean;
  showTalentPoolNav: boolean;
};

const CANDIDATE_PRIMARY_NAV = [
  {
    key: "my_profile",
    tab: "my_profile" as const,
    label: "My Profile",
    icon: "User" as const,
  },
  {
    key: "opportunities",
    tab: "opportunities" as const,
    label: "Provix Talent Network",
    icon: "Compass" as const,
  },
  {
    key: "intro_requests",
    tab: "intro_requests" as const,
    label: "Intro Requests",
    icon: "Mail" as const,
  },
] as const;

const CAREER_ACCELERATOR_NAV = [
  {
    key: "github-auditor",
    href: "/dashboard/auditor",
    label: "Code & Resume Auditor",
  },
  {
    key: "interview-prep",
    href: "/dashboard/interview-prep",
    label: "Interview Simulator",
  },
] as const;

const EMPLOYEE_HUB_NAV = [
  {
    key: "opportunity_radar",
    tab: "opportunity_radar" as const,
    label: "Provix Talent Network",
    icon: "Radar" as const,
  },
  {
    key: "applications",
    tab: "applications" as const,
    label: "Applications",
    icon: "Document" as const,
  },
] as const;

const EMPLOYER_HUB_NAV = [
  {
    key: "my_profile",
    tab: "my_profile" as const,
    label: "Company Profile",
    icon: "User" as const,
  },
  {
    key: "applicants",
    tab: "applicants" as const,
    label: "Applicants",
    icon: "Briefcase" as const,
  },
] as const;

const EMPLOYER_CONSOLE_NAV = [
  {
    key: "talent",
    tab: "talent" as const,
    label: "Provix Talent Network",
    icon: "Users" as const,
  },
  {
    key: "evaluator",
    tab: "evaluator" as const,
    label: "AI Screen Candidate",
    icon: "Document" as const,
  },
  {
    key: "auditor",
    tab: "auditor" as const,
    label: "Code & Resume Auditor",
    icon: "Shield" as const,
  },
] as const;

function isPrimaryNavVisible(
  key: (typeof CANDIDATE_PRIMARY_NAV)[number]["key"],
  visibility: NavVisibility
) {
  if (key === "my_profile") {
    return true;
  }

  return !visibility.isBusinessAccount;
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

function NavIcon({
  name,
  active = false,
}: {
  name:
    | "User"
    | "Compass"
    | "Mail"
    | "Radar"
    | "Document"
    | "Users"
    | "Shield"
    | "Briefcase";
  active?: boolean;
}) {
  const tone = active ? "text-zinc-200" : "text-zinc-400";

  if (name === "Shield") {
    return (
      <span
        className={`inline-flex h-4 w-4 shrink-0 items-center justify-center ${tone}`}
      >
        <ShieldCheck className="h-4 w-4" aria-hidden="true" />
      </span>
    );
  }

  const Icon = DashboardIcons[name];
  return (
    <span
      className={`inline-flex h-4 w-4 shrink-0 items-center justify-center ${tone}`}
    >
      <Icon />
    </span>
  );
}

function ToolIcon({
  kind,
  active,
}: {
  kind: "auditor" | "interview";
  active: boolean;
}) {
  const tone = active ? "text-zinc-200" : "text-zinc-400";
  const Icon = kind === "auditor" ? ShieldCheck : Terminal;
  return <Icon className={`h-4 w-4 shrink-0 ${tone}`} aria-hidden="true" />;
}

function DashboardTabLink({
  tab,
  label,
  iconName,
}: {
  tab: DashboardTab;
  label: string;
  iconName:
    | "User"
    | "Compass"
    | "Mail"
    | "Radar"
    | "Document"
    | "Users"
    | "Shield"
    | "Briefcase";
}) {
  const pathname = usePathname();
  const {
    activeTab,
    setActiveTab,
    setMobileNavOpen,
    isGuest,
    isBusinessAccount,
    requireAuth,
  } = useDashboardNav();
  const isActive = isNavTabActive(tab, pathname, activeTab);
  const href =
    tab === "my_profile" && isBusinessAccount
      ? "/dashboard?tab=my_profile"
      : dashboardTabHref(tab);
  const icon = <NavIcon name={iconName} active={isActive} />;

  const selectTab = () => {
    setActiveTab(tab);
    setMobileNavOpen(false);
  };

  let control: ReactNode;

  if (tab === "opportunities") {
    control = (
      <Link
        href={dashboardTabHref(tab)}
        onClick={() => setMobileNavOpen(false)}
        className={navItemClass(isActive)}
      >
        {icon}
        <span className="truncate">{label}</span>
      </Link>
    );
  } else if (isGuest) {
    control = (
      <button
        type="button"
        onClick={() => {
          setMobileNavOpen(false);
          requireAuth();
        }}
        className={navItemClass(isActive)}
      >
        {icon}
        <span className="truncate">{label}</span>
      </button>
    );
  } else if (isDashboardRootPath(pathname)) {
    control = (
      <button
        type="button"
        onClick={selectTab}
        className={navItemClass(isActive)}
      >
        {icon}
        <span className="truncate">{label}</span>
      </button>
    );
  } else {
    control = (
      <Link href={href} onClick={selectTab} className={navItemClass(isActive)}>
        {icon}
        <span className="truncate">{label}</span>
      </Link>
    );
  }

  return <li className={navItemShellClass}>{control}</li>;
}

function ProtectedNavLink({
  href,
  label,
  icon,
  isActive,
}: {
  href: string;
  label: ReactNode;
  icon: ReactNode;
  isActive: boolean;
}) {
  const { isGuest, requireAuth, setMobileNavOpen } = useDashboardNav();

  const control = isGuest ? (
    <button
      type="button"
      onClick={() => {
        setMobileNavOpen(false);
        requireAuth();
      }}
      className={navItemClass(isActive)}
    >
      {icon}
      <span className="truncate">{label}</span>
    </button>
  ) : (
    <Link
      href={href}
      onClick={() => setMobileNavOpen(false)}
      className={navItemClass(isActive)}
    >
      {icon}
      <span className="truncate">{label}</span>
    </Link>
  );

  return <li className={navItemShellClass}>{control}</li>;
}

function SidebarBrand() {
  return (
    <Link
      href="/"
      className={`mb-5 flex items-center gap-2.5 ${ALIGN_X} py-1.5 transition-opacity hover:opacity-90`}
    >
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-zinc-700/80 bg-zinc-900 text-[11px] font-bold text-white">
        P
      </span>
      <span className="text-xs font-bold tracking-widest text-zinc-100">
        PROVIX
      </span>
    </Link>
  );
}

function SidebarUserFooter() {
  const {
    isGuest,
    authLoading,
    userAvatarUrl,
    userInitials,
    userDisplayName,
    isVerifiedEmployer,
    requireAuth,
    setMobileNavOpen,
  } = useDashboardNav();

  if (isGuest && !authLoading) {
    return (
      <div className="mt-auto border-t border-zinc-800 pt-4">
        <button
          type="button"
          onClick={() => {
            setMobileNavOpen(false);
            requireAuth();
          }}
          className="w-full cursor-pointer rounded-md bg-zinc-100 px-2.5 py-1.5 text-xs font-semibold text-zinc-950 transition-colors hover:bg-white"
        >
          Sign In
        </button>
      </div>
    );
  }

  if (isGuest || authLoading) {
    return null;
  }

  const statusLabel = isVerifiedEmployer ? "Vetted" : "Available";

  return (
    <div className="mt-auto border-t border-zinc-800 pt-4">
      <div className={`flex items-center gap-2.5 ${ALIGN_X}`}>
        {userAvatarUrl ? (
          <img
            src={userAvatarUrl}
            alt=""
            className="h-7 w-7 shrink-0 rounded-md object-cover ring-1 ring-zinc-700/60"
          />
        ) : (
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-zinc-800 text-[10px] font-semibold text-zinc-200 ring-1 ring-zinc-700/60">
            {userInitials}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-zinc-200">
            {userDisplayName}
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-[10px] text-zinc-500">
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                isVerifiedEmployer ? "bg-emerald-400" : "bg-zinc-500"
              }`}
              aria-hidden
            />
            {statusLabel}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function DashboardSidebar() {
  const pathname = usePathname();
  const {
    isBusinessAccount,
    isEmployeeAccount,
    isGuest,
    showTalentPoolNav,
  } = useDashboardNav();

  const visibility: NavVisibility = {
    isBusinessAccount,
    isEmployeeAccount,
    isGuest,
    showTalentPoolNav,
  };

  const showCandidateAccelerator =
    isGuest || (!isBusinessAccount && !isEmployeeAccount);

  const primaryItems = isBusinessAccount
    ? EMPLOYER_HUB_NAV
    : CANDIDATE_PRIMARY_NAV.filter((item) =>
        isPrimaryNavVisible(item.key, visibility)
      );

  return (
    <div className="flex min-h-full flex-col justify-between bg-zinc-950 p-3">
      <div>
        <SidebarBrand />

        <div>
          <span className={sectionHeaderClass}>
            {isBusinessAccount
              ? "Organization"
              : isEmployeeAccount
                ? "Employee"
                : "General"}
          </span>
          <ul className={navListClass}>
            {primaryItems.map((item) => (
              <DashboardTabLink
                key={item.key}
                tab={item.tab}
                label={item.label}
                iconName={item.icon}
              />
            ))}
          </ul>
        </div>

        {showCandidateAccelerator && (
          <div className="mt-5">
            <span className={sectionHeaderClass}>Tools</span>
            <ul className={navListClass}>
              {CAREER_ACCELERATOR_NAV.map((item) => {
                const isActive =
                  item.key === "github-auditor"
                    ? isAuditorPath(pathname)
                    : isInterviewPrepPath(pathname);
                return (
                  <ProtectedNavLink
                    key={item.key}
                    href={item.href}
                    isActive={isActive}
                    icon={
                      <ToolIcon
                        kind={
                          item.key === "github-auditor"
                            ? "auditor"
                            : "interview"
                        }
                        active={isActive}
                      />
                    }
                    label={item.label}
                  />
                );
              })}
            </ul>
          </div>
        )}

        {isEmployeeAccount && (
          <div className="mt-5">
            <span className={sectionHeaderClass}>Network</span>
            <ul className={navListClass}>
              {EMPLOYEE_HUB_NAV.map((item) => (
                <DashboardTabLink
                  key={item.key}
                  tab={item.tab}
                  label={item.label}
                  iconName={item.icon}
                />
              ))}
            </ul>
          </div>
        )}

        {showTalentPoolNav && (
          <div className="mt-5">
            <span className={sectionHeaderClass}>Evaluation</span>
            <ul className={navListClass}>
              {EMPLOYER_CONSOLE_NAV.map((item) => (
                <DashboardTabLink
                  key={item.key}
                  tab={item.tab}
                  label={item.label}
                  iconName={item.icon}
                />
              ))}
            </ul>
          </div>
        )}
      </div>

      <SidebarUserFooter />
    </div>
  );
}
