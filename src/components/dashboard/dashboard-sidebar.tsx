"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { PenTool, ShieldCheck, Terminal } from "lucide-react";
import { ProvixLogo } from "@/components/ProvixLogo";
import {
  isAuditorPath,
  isDashboardRootPath,
  isInterviewPrepPath,
  isOpportunitiesPath,
  isPitchStudioPath,
  type DashboardTab,
} from "@/lib/dashboard-account";
import { DashboardIcons } from "@/components/dashboard/dashboard-icons";
import { useDashboardNav } from "@/components/dashboard/dashboard-nav-context";

function navButtonClass(isActive: boolean, variant: "default" | "employer" = "default") {
  if (variant === "employer") {
    return isActive
      ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-bold"
      : "text-slate-500 hover:bg-slate-800/30";
  }

  return isActive
    ? "bg-slate-800/60 text-white font-bold"
    : "text-slate-500 hover:bg-slate-800/30";
}

function navItemClass(isActive: boolean, variant: "default" | "employer" = "default") {
  return `w-full text-left px-3 py-2 rounded-lg transition-all duration-200 flex items-center gap-3 text-[13px] cursor-pointer ${navButtonClass(isActive, variant)}`;
}

const secondaryNavSectionClass = "mt-8 pt-8 border-t border-slate-800/60";

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
  const { activeTab, setActiveTab, setMobileNavOpen, isGuest, requireAuth } =
    useDashboardNav();
  const isActive =
    tab === "opportunities"
      ? isOpportunitiesPath(pathname) ||
        (isDashboardRootPath(pathname) && activeTab === tab)
      : isDashboardRootPath(pathname) && activeTab === tab;

  if (isGuest) {
    if (tab === "opportunities") {
      return (
        <Link
          href="/opportunities"
          onClick={() => setMobileNavOpen(false)}
          className={navItemClass(isActive, variant)}
        >
          {icon}
          {label}
        </Link>
      );
    }

    return (
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
  }

  return (
    <Link
      href="/dashboard"
      onClick={() => {
        setActiveTab(tab);
        setMobileNavOpen(false);
      }}
      className={navItemClass(isActive, variant)}
    >
      {icon}
      {label}
    </Link>
  );
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

  if (isGuest) {
    return (
      <button
        type="button"
        onClick={() => {
          setMobileNavOpen(false);
          requireAuth();
        }}
        className={navItemClass(isActive)}
      >
        {icon}
        {label}
      </button>
    );
  }

  return (
    <Link
      href={href}
      onClick={() => setMobileNavOpen(false)}
      className={navItemClass(isActive)}
    >
      {icon}
      {label}
    </Link>
  );
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

  const showCandidateAccelerator =
    isGuest || (!isBusinessAccount && !isEmployeeAccount);

  return (
    <div className="p-6 flex flex-col min-h-full">
      <Link href="/" className="block mb-8 hover:opacity-90 transition-opacity">
        <ProvixLogo />
        <span className="text-[10px] text-slate-400 font-medium tracking-widest uppercase mt-2 block">
          Verified Intelligence
        </span>
      </Link>

      <div className="flex-1">
        <div>
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-3 px-2">
            {isBusinessAccount
              ? "Company Hub"
              : isEmployeeAccount
                ? "Employee Dashboard"
                : "Candidate Dashboard"}
          </span>
          <nav className="space-y-1">
            <DashboardTabLink
              tab="my_profile"
              label={isBusinessAccount ? "Company Profile" : "My Profile"}
              icon={<DashboardIcons.User />}
            />
            {!isBusinessAccount && (
              <>
                <DashboardTabLink
                  tab="opportunities"
                  label="Opportunities"
                  icon={<DashboardIcons.Compass />}
                />
                <DashboardTabLink
                  tab="intro_requests"
                  label="Intro Requests"
                  icon={<DashboardIcons.Mail />}
                />
              </>
            )}
          </nav>
        </div>

        {showCandidateAccelerator && (
          <div className={secondaryNavSectionClass}>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-3 px-2">
              Career Accelerator
            </span>
            <nav className="space-y-1">
              <ProtectedNavLink
                href="/dashboard/pitch-studio"
                isActive={isPitchStudioPath(pathname)}
                icon={<PenTool className="w-4 h-4" aria-hidden="true" />}
                label="Pitch Studio"
              />
              <Link
                href="/audits"
                onClick={() => setMobileNavOpen(false)}
                className={navItemClass(isAuditorPath(pathname))}
              >
                <ShieldCheck className="w-4 h-4" aria-hidden="true" />
                GitHub &amp; Resume Auditor
              </Link>
              <ProtectedNavLink
                href="/dashboard/interview-prep"
                isActive={isInterviewPrepPath(pathname)}
                icon={<Terminal className="w-4 h-4" aria-hidden="true" />}
                label="Interview Simulator"
              />
            </nav>
          </div>
        )}

        {isEmployeeAccount && (
          <div className={secondaryNavSectionClass}>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-3 px-2">
              Opportunity Hub
            </span>
            <nav className="space-y-1">
              <DashboardTabLink
                tab="opportunity_radar"
                label="Opportunity Radar"
                icon={<DashboardIcons.Radar />}
                variant="employer"
              />
              <DashboardTabLink
                tab="applications"
                label="Applications"
                icon={<DashboardIcons.Document />}
                variant="employer"
              />
            </nav>
          </div>
        )}

        {showTalentPoolNav && (
          <div className={secondaryNavSectionClass}>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-3 px-2">
              Employer Console (B2B)
            </span>
            <nav className="space-y-1">
              <DashboardTabLink
                tab="talent"
                label="Vetted Talent Pool"
                icon={<DashboardIcons.Users />}
                variant="employer"
              />
              <DashboardTabLink
                tab="evaluator"
                label="AI Screen Candidate"
                icon={<DashboardIcons.Document />}
                variant="employer"
              />
              <DashboardTabLink
                tab="revenue"
                label="Placement Revenue"
                icon={<DashboardIcons.Briefcase />}
                variant="employer"
              />
            </nav>
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
          className="mt-8 w-full bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-4 py-2.5 rounded-lg transition-all cursor-pointer"
        >
          Sign In
        </button>
      )}
    </div>
  );
}
