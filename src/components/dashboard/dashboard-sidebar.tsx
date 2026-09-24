"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Briefcase,
  Building2,
  Compass,
  FileText,
  Mail,
  Radar,
  Settings,
  ShieldCheck,
  Terminal,
  User,
  Users,
} from "lucide-react";
import {
  dashboardTabHref,
  isAuditorPath,
  isDashboardAuditorPath,
  isDashboardProfilePath,
  isDashboardRootPath,
  isInterviewPrepPath,
  isOpportunitiesPath,
  type DashboardTab,
} from "@/lib/dashboard-account";
import {
  isCandidateIntroDismissed,
  isPendingCandidateIntroStatus,
} from "@/lib/candidate-intro-requests";
import { getAvailabilitySidebarPresentation } from "@/lib/availability-status";
import { employerCompanyLabel, isMissingCompanyName } from "@/lib/company-name";
import { ProvixLogo } from "@/components/ProvixLogo";
import { createClient } from "@/utils/supabase/client";
import { useDashboardNav } from "@/components/dashboard/dashboard-nav-context";

const navListClass = "m-0 flex list-none flex-col gap-0.5 p-0";
const navItemShellClass = "order-none w-full shrink-0";
const sectionHeaderClass =
  "mb-1 block px-3 font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-500";

const ACTIVE_ITEM = "bg-white/[0.06] text-white font-medium rounded-lg";
const INACTIVE_ITEM =
  "text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.04] rounded-lg";

function navItemClass(isActive: boolean) {
  return `w-full text-left px-3 py-2 text-sm font-medium flex items-center gap-3 cursor-pointer transition-colors ${
    isActive ? ACTIVE_ITEM : INACTIVE_ITEM
  }`;
}

type IconName =
  | "User"
  | "Compass"
  | "Mail"
  | "Radar"
  | "Document"
  | "Users"
  | "Shield"
  | "Briefcase"
  | "Terminal";

const ICON_MAP = {
  User,
  Compass,
  Mail,
  Radar,
  Document: FileText,
  Users,
  Shield: ShieldCheck,
  Briefcase,
  Terminal,
} as const;

const CANDIDATE_WORKSPACE_NAV = [
  {
    key: "profile",
    tab: "my_profile" as const,
    label: "Profile",
    icon: "User" as const,
  },
  {
    key: "intro_requests",
    tab: "intro_requests" as const,
    label: "Intro Requests",
    icon: "Mail" as const,
    showBadge: true,
  },
  {
    key: "opportunities",
    tab: "opportunities" as const,
    label: "Talent Network",
    icon: "Compass" as const,
  },
] as const;

const ENGINEERING_TOOLS_NAV = [
  {
    key: "github-auditor",
    href: "/dashboard/auditor",
    label: "Code Auditor",
    icon: "Shield" as const,
  },
  {
    key: "interview-prep",
    href: "/dashboard/interview-prep",
    label: "Interview Simulator",
    icon: "Terminal" as const,
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

  if (tab === "my_profile") {
    return (
      isDashboardProfilePath(pathname) ||
      (isDashboardRootPath(pathname) && activeTab === tab)
    );
  }

  return isDashboardRootPath(pathname) && activeTab === tab;
}

function isEngineeringToolActive(
  key: (typeof ENGINEERING_TOOLS_NAV)[number]["key"],
  pathname: string
) {
  if (key === "github-auditor") {
    return isAuditorPath(pathname);
  }
  return isInterviewPrepPath(pathname);
}

function NavIcon({
  name,
  active = false,
}: {
  name: IconName;
  active?: boolean;
}) {
  const Icon = ICON_MAP[name];
  return (
    <Icon
      className={`h-4 w-4 shrink-0 ${active ? "text-violet-300" : "text-zinc-400"}`}
      strokeWidth={1.5}
      aria-hidden="true"
    />
  );
}

function DashboardTabLink({
  tab,
  label,
  iconName,
  badge,
}: {
  tab: DashboardTab;
  label: string;
  iconName: IconName;
  badge?: ReactNode;
}) {
  const pathname = usePathname();
  const {
    activeTab,
    setActiveTab,
    setMobileNavOpen,
    isGuest,
    isBusinessAccount,
    requireAuth,
    setProfileStudioSection,
  } = useDashboardNav();

  const isActive = isNavTabActive(tab, pathname, activeTab);

  const href =
    tab === "my_profile" && isBusinessAccount
      ? "/dashboard?tab=my_profile"
      : dashboardTabHref(tab);
  const icon = <NavIcon name={iconName} active={isActive} />;

  const selectTab = () => {
    if (tab === "my_profile") {
      setProfileStudioSection("profile");
    }
    setActiveTab(tab);
    setMobileNavOpen(false);
  };

  const body = (
    <>
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${
          isActive ? "bg-violet-400" : "bg-transparent"
        }`}
        aria-hidden
      />
      {icon}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {badge}
    </>
  );

  let control: ReactNode;

  if (tab === "opportunities") {
    control = (
      <Link
        href={href}
        onClick={() => setMobileNavOpen(false)}
        className={navItemClass(isActive)}
      >
        {body}
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
        {body}
      </button>
    );
  } else if (tab === "my_profile") {
    control = (
      <Link
        href={href}
        onClick={selectTab}
        className={navItemClass(isActive)}
      >
        {body}
      </Link>
    );
  } else if (isDashboardRootPath(pathname)) {
    control = (
      <button
        type="button"
        onClick={selectTab}
        className={navItemClass(isActive)}
      >
        {body}
      </button>
    );
  } else {
    control = (
      <Link href={href} onClick={selectTab} className={navItemClass(isActive)}>
        {body}
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
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${
          isActive ? "bg-violet-400" : "bg-transparent"
        }`}
        aria-hidden
      />
      {icon}
      <span className="truncate">{label}</span>
    </button>
  ) : (
    <Link
      href={href}
      onClick={() => setMobileNavOpen(false)}
      className={navItemClass(isActive)}
    >
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${
          isActive ? "bg-violet-400" : "bg-transparent"
        }`}
        aria-hidden
      />
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
      className="mb-6 flex items-center gap-2.5 px-3 py-1.5 transition-opacity hover:opacity-90"
    >
      <ProvixLogo className="h-6 w-6" showText={false} />
      <span className="text-base font-semibold tracking-tight text-white">
        PROVIX
      </span>
    </Link>
  );
}

function IntroBadge({ count }: { count: number }) {
  if (count < 1) {
    return null;
  }

  return (
    <span className="ml-auto inline-flex min-w-[1.25rem] items-center justify-center rounded border border-white/[0.08] bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px] font-medium tabular-nums text-zinc-200">
      {count > 99 ? "99+" : count}
    </span>
  );
}

function initialsFromLabel(label: string): string {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const first = parts[0]?.[0] ?? "";
    const last = parts[parts.length - 1]?.[0] ?? "";
    return `${first}${last}`.toUpperCase();
  }

  return (parts[0] ?? "AC").slice(0, 2).toUpperCase();
}

function isUsableImageUrl(url: string | null | undefined): boolean {
  const value = url?.trim() ?? "";
  if (!value) {
    return false;
  }

  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

const avatarFallbackClass =
  "flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-zinc-800 border border-zinc-700 text-zinc-300";

function SidebarAvatar({
  imageUrl,
  isEmployer,
  companyLabel,
  initials,
}: {
  imageUrl: string | null;
  isEmployer: boolean;
  companyLabel: string;
  initials: string;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const usableUrl = isUsableImageUrl(imageUrl) ? imageUrl : null;
  const showImage = Boolean(usableUrl) && !imageFailed;

  useEffect(() => {
    setImageFailed(false);
  }, [imageUrl]);

  if (showImage && usableUrl) {
    return (
      <img
        src={usableUrl}
        alt=""
        onError={() => setImageFailed(true)}
        className="h-8 w-8 shrink-0 rounded-md object-cover border border-zinc-700"
      />
    );
  }

  if (isEmployer) {
    const companyInitial = companyLabel.trim().charAt(0).toUpperCase();
    const hasRealCompany = !isMissingCompanyName(companyLabel) && companyInitial;

    return (
      <span className={avatarFallbackClass}>
        {hasRealCompany ? (
          <span className="text-[11px] font-semibold">{companyInitial}</span>
        ) : (
          <Building2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        )}
      </span>
    );
  }

  return <span className={avatarFallbackClass}>{initials}</span>;
}

function SidebarUserFooter() {
  const pathname = usePathname();
  const router = useRouter();
  const {
    isGuest,
    authLoading,
    userAvatarUrl,
    userInitials,
    userDisplayName,
    companyName,
    availabilityStatus,
    isVerifiedEmployer,
    isBusinessAccount,
    requireAuth,
    setMobileNavOpen,
    setActiveTab,
    setProfileStudioSection,
  } = useDashboardNav();
  const availabilityPresentation =
    getAvailabilitySidebarPresentation(availabilityStatus);

  const openSettings = () => {
    if (isGuest) {
      setMobileNavOpen(false);
      requireAuth();
      return;
    }
    setProfileStudioSection("settings");
    setActiveTab("my_profile");
    setMobileNavOpen(false);
    if (!isDashboardRootPath(pathname) && !isDashboardProfilePath(pathname)) {
      router.push(dashboardTabHref("my_profile"));
    }
  };

  if (isGuest && !authLoading) {
    return (
      <div className="mt-auto border-t border-white/[0.08] pt-3">
        <button
          type="button"
          onClick={() => {
            setMobileNavOpen(false);
            requireAuth();
          }}
          className="w-full cursor-pointer rounded-lg bg-[#F4F4F6] px-3 py-2 text-xs font-semibold text-[#0B0B0D] transition-colors hover:bg-white"
        >
          Sign In
        </button>
      </div>
    );
  }

  if (isGuest || authLoading) {
    return null;
  }

  const companyLabel = employerCompanyLabel(companyName);
  const recruiterName = userDisplayName.trim();
  const showRecruiterName =
    isBusinessAccount &&
    recruiterName.length > 0 &&
    recruiterName !== "Developer" &&
    recruiterName !== companyLabel;
  const primaryLabel = isBusinessAccount ? companyLabel : userDisplayName;
  const avatarInitials = isBusinessAccount
    ? initialsFromLabel(companyLabel)
    : userInitials;
  const statusLabel = isBusinessAccount
    ? isVerifiedEmployer === true
      ? "Verified Employer"
      : isVerifiedEmployer === false
        ? "Unverified"
        : "Checking"
    : availabilityPresentation.label;
  const statusTitle = isBusinessAccount
    ? isVerifiedEmployer === true
      ? "Verified hiring company on Provix"
      : undefined
    : undefined;
  const dotClass = isBusinessAccount
    ? isVerifiedEmployer === true
      ? "bg-emerald-500"
      : isVerifiedEmployer === false
        ? "bg-zinc-500"
        : "bg-zinc-600"
    : availabilityPresentation.dotClass;

  return (
    <div className="mt-auto border-t border-white/[0.08] pt-3">
      <div className="flex items-center gap-2.5 rounded-lg border border-white/[0.08] bg-[#131316]/90 px-2.5 py-2">
        <SidebarAvatar
          imageUrl={userAvatarUrl}
          isEmployer={isBusinessAccount}
          companyLabel={companyName ?? ""}
          initials={avatarInitials}
        />
        <div className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-zinc-200">
            {primaryLabel}
          </span>
          {showRecruiterName ? (
            <span className="block truncate text-[11px] text-zinc-500">
              {recruiterName}
            </span>
          ) : null}
          <div
            className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-zinc-400"
            title={statusTitle}
          >
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotClass}`}
              aria-hidden
            />
            <span className="truncate">
              {isBusinessAccount
                ? statusLabel
                : availabilityStatus || "Open to roles"}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={openSettings}
          aria-label="Account settings"
          className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-[#1A1A1E] hover:text-zinc-200"
        >
          <Settings className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

function NavSection({
  title,
  children,
  className = "",
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <span className={sectionHeaderClass}>{title}</span>
      <ul className={navListClass}>{children}</ul>
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
    userId,
  } = useDashboardNav();
  const [pendingIntroCount, setPendingIntroCount] = useState(0);

  const showCandidateNav =
    isGuest || (!isBusinessAccount && !isEmployeeAccount);

  useEffect(() => {
    if (!userId || !showCandidateNav || isGuest) {
      setPendingIntroCount(0);
      return;
    }

    let cancelled = false;
    const supabase = createClient();

    const loadIntros = async () => {
      const { data, error } = await supabase
        .from("intro_requests")
        .select("id, status, candidate_dismissed_at")
        .eq("candidate_id", userId);

      if (cancelled) {
        return;
      }

      if (error || !data) {
        const fallback = await supabase
          .from("intro_requests")
          .select("id, status")
          .eq("candidate_id", userId);

        if (cancelled || fallback.error || !fallback.data) {
          return;
        }

        const pending = fallback.data.filter((row) =>
          isPendingCandidateIntroStatus(row.status)
        ).length;
        setPendingIntroCount(pending);
        return;
      }

      const pending = data.filter(
        (row) =>
          !isCandidateIntroDismissed(row) &&
          isPendingCandidateIntroStatus(row.status)
      ).length;
      setPendingIntroCount(pending);
    };

    void loadIntros();
    return () => {
      cancelled = true;
    };
  }, [userId, showCandidateNav, isGuest]);

  return (
    <div className="flex min-h-screen flex-col justify-between bg-[#0E0E12] p-4">
      <div>
        <SidebarBrand />

        {showCandidateNav ? (
          <>
            <NavSection title="Workspace">
              {CANDIDATE_WORKSPACE_NAV.map((item) => (
                <DashboardTabLink
                  key={item.key}
                  tab={item.tab}
                  label={item.label}
                  iconName={item.icon}
                  badge={
                    "showBadge" in item && item.showBadge ? (
                      <IntroBadge count={pendingIntroCount} />
                    ) : undefined
                  }
                />
              ))}
            </NavSection>

            <NavSection title="Tools" className="mt-5">
              {ENGINEERING_TOOLS_NAV.map((item) => {
                const isActive = isEngineeringToolActive(item.key, pathname);
                return (
                  <ProtectedNavLink
                    key={item.key}
                    href={item.href}
                    isActive={isActive}
                    icon={<NavIcon name={item.icon} active={isActive} />}
                    label={item.label}
                  />
                );
              })}
            </NavSection>
          </>
        ) : (
          <>
            {isBusinessAccount && (
              <NavSection title="Organization">
                {EMPLOYER_HUB_NAV.map((item) => (
                  <DashboardTabLink
                    key={item.key}
                    tab={item.tab}
                    label={item.label}
                    iconName={item.icon}
                  />
                ))}
              </NavSection>
            )}

            {isEmployeeAccount && (
              <NavSection title="Network">
                {EMPLOYEE_HUB_NAV.map((item) => (
                  <DashboardTabLink
                    key={item.key}
                    tab={item.tab}
                    label={item.label}
                    iconName={item.icon}
                  />
                ))}
              </NavSection>
            )}

            {showTalentPoolNav && (
              <NavSection title="Evaluation" className="mt-5">
                {EMPLOYER_CONSOLE_NAV.map((item) => (
                  <DashboardTabLink
                    key={item.key}
                    tab={item.tab}
                    label={item.label}
                    iconName={item.icon}
                  />
                ))}
              </NavSection>
            )}
          </>
        )}
      </div>

      <SidebarUserFooter />
    </div>
  );
}
