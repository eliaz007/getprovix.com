"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { PenTool, ShieldCheck, Terminal } from "lucide-react";
import { ProvixLogo } from "@/components/ProvixLogo";
import {
  dashboardTabHref,
  isAuditorPath,
  isDashboardAuditorPath,
  isDashboardRootPath,
  isInterviewPrepPath,
  isOpportunitiesPath,
  isPitchStudioPath,
  type DashboardTab,
} from "@/lib/dashboard-account";
import { DashboardIcons } from "@/components/dashboard/dashboard-icons";
import { useDashboardNav } from "@/components/dashboard/dashboard-nav-context";

const navListClass = "m-0 flex list-none flex-col gap-1 p-0";
const navItemShellClass = "order-none w-full shrink-0";

function navButtonClass(
  isActive: boolean,
  variant: "default" | "employer" = "default"
) {
  if (variant === "employer") {
    return isActive
      ? "bg-brandGlow text-brand border-brand/20"
      : "text-textMuted border-transparent hover:bg-panel hover:text-textMain";
  }

  return isActive
    ? "bg-panel text-white border-transparent"
    : "text-textMuted border-transparent hover:bg-panel hover:text-textMain";
}

function navItemClass(
  isActive: boolean,
  variant: "default" | "employer" = "default"
) {
  return `w-full text-left px-3 py-2 rounded-lg border font-medium transition-colors duration-200 ease-out flex items-center gap-3 text-[13px] cursor-pointer ${navButtonClass(isActive, variant)}`;
}

const secondaryNavSectionClass = "mt-8 pt-8 border-t border-border";

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
    key: "pitch-studio",
    href: "/dashboard/pitch-studio",
    label: "Pitch Studio",
  },
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
}: {
  name: "User" | "Compass" | "Mail" | "Radar" | "Document" | "Users" | "Shield" | "Briefcase";
}) {
  if (name === "Shield") {
    return (
      <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center">
        <ShieldCheck className="h-4 w-4" aria-hidden="true" />
      </span>
    );
  }

  const Icon = DashboardIcons[name];
  return (
    <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center">
      <Icon />
    </span>
  );
}

function DashboardTabLink({
  tab,
  label,
  icon,
  variant = "default",
}: {
  tab: DashboardTab;
  label: string;
  icon: ReactNode;
  variant?: "default" | "employer";
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
        className={navItemClass(isActive, variant)}
      >
        {icon}
        {label}
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
        className={navItemClass(isActive, variant)}
      >
        {icon}
        {label}
      </button>
    );
  } else if (isDashboardRootPath(pathname)) {
    control = (
      <button
        type="button"
        onClick={selectTab}
        className={navItemClass(isActive, variant)}
      >
        {icon}
        {label}
      </button>
    );
  } else {
    control = (
      <Link
        href={href}
        onClick={selectTab}
        className={navItemClass(isActive, variant)}
      >
        {icon}
        {label}
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
  variant = "default",
}: {
  href: string;
  label: ReactNode;
  icon: ReactNode;
  isActive: boolean;
  variant?: "default" | "employer";
}) {
  const { isGuest, requireAuth, setMobileNavOpen } = useDashboardNav();

  const control = isGuest ? (
    <button
      type="button"
      onClick={() => {
        setMobileNavOpen(false);
        requireAuth();
      }}
      className={navItemClass(isActive, variant)}
    >
      {icon}
      {label}
    </button>
  ) : (
    <Link
      href={href}
      onClick={() => setMobileNavOpen(false)}
      className={navItemClass(isActive, variant)}
    >
      {icon}
      {label}
    </Link>
  );

  return <li className={navItemShellClass}>{control}</li>;
}

export default function DashboardSidebar() {
  const pathname = usePathname();
  const {
    authLoading,
    isGuest,
    isBusinessAccount,
    isEmployeeAccount,
    showTalentPoolNav,
    requireAuth,
    setMobileNavOpen,
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
    <div className="p-6 flex flex-col min-h-full">
      <Link href="/" className="block mb-8 hover:opacity-90 transition-opacity">
        <ProvixLogo />
      </Link>

      <div className="flex-1">
        <div
          className={
            !isBusinessAccount && !isEmployeeAccount
              ? secondaryNavSectionClass
              : undefined
          }
        >
          <span
            className={
              isBusinessAccount
                ? "text-[11px] font-semibold tracking-wider text-zinc-500 uppercase px-3 py-2 block"
                : "text-[10px] font-bold text-textMuted uppercase tracking-widest block mb-3 px-2"
            }
          >
            {isBusinessAccount
              ? "Organization"
              : isEmployeeAccount
                ? "Employee Dashboard"
                : "Candidate Dashboard"}
          </span>
          <ul className={navListClass}>
            {primaryItems.map((item) => (
              <DashboardTabLink
                key={item.key}
                tab={item.tab}
                label={item.label}
                icon={<NavIcon name={item.icon} />}
              />
            ))}
          </ul>
        </div>

        {showCandidateAccelerator && (
          <div className={secondaryNavSectionClass}>
            <span className="text-[10px] font-bold text-textMuted uppercase tracking-widest block mb-3 px-2">
              Career Accelerator
            </span>
            <ul className={navListClass}>
              {CAREER_ACCELERATOR_NAV.map((item) => (
                <ProtectedNavLink
                  key={item.key}
                  href={item.href}
                  isActive={
                    item.key === "pitch-studio"
                      ? isPitchStudioPath(pathname)
                      : item.key === "github-auditor"
                        ? isAuditorPath(pathname)
                        : isInterviewPrepPath(pathname)
                  }
                  icon={
                    item.key === "pitch-studio" ? (
                      <PenTool className="w-4 h-4 shrink-0" aria-hidden="true" />
                    ) : item.key === "github-auditor" ? (
                      <ShieldCheck className="w-4 h-4 shrink-0" aria-hidden="true" />
                    ) : (
                      <Terminal className="w-4 h-4 shrink-0" aria-hidden="true" />
                    )
                  }
                  label={item.label}
                />
              ))}
            </ul>
          </div>
        )}

        {isEmployeeAccount && (
          <div className={secondaryNavSectionClass}>
            <span className="text-[10px] font-bold text-textMuted uppercase tracking-widest block mb-3 px-2">
              Provix Talent Network
            </span>
            <ul className={navListClass}>
              {EMPLOYEE_HUB_NAV.map((item) => (
                <DashboardTabLink
                  key={item.key}
                  tab={item.tab}
                  label={item.label}
                  icon={<NavIcon name={item.icon} />}
                  variant="employer"
                />
              ))}
            </ul>
          </div>
        )}

        {showTalentPoolNav && (
          <div className={secondaryNavSectionClass}>
            <span className="text-[11px] font-semibold tracking-wider text-zinc-500 uppercase px-3 py-2 block">
              Talent & Evaluation
            </span>
            <ul className={navListClass}>
              {EMPLOYER_CONSOLE_NAV.map((item) => (
                <DashboardTabLink
                  key={item.key}
                  tab={item.tab}
                  label={item.label}
                  icon={<NavIcon name={item.icon} />}
                  variant="employer"
                />
              ))}
            </ul>
          </div>
        )}
      </div>

      {isGuest && !authLoading && (
        <button
          type="button"
          onClick={() => {
            setMobileNavOpen(false);
            requireAuth();
          }}
          className="mt-8 w-full bg-brand hover:bg-brandHover text-white text-xs font-bold tracking-tight px-4 py-2.5 rounded-md transition-colors duration-200 ease-out cursor-pointer"
        >
          {isOpportunitiesPath(pathname)
            ? "Sign in to get matched"
            : "Sign In"}
        </button>
      )}
    </div>
  );
}
