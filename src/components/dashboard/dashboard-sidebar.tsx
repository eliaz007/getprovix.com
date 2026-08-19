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
  const { activeTab, setActiveTab, setMobileNavOpen } = useDashboardNav();
  const isActive = isDashboardRootPath(pathname) && activeTab === tab;

  return (
    <Link
      href="/dashboard"
      onClick={() => {
        setActiveTab(tab);
        setMobileNavOpen(false);
      }}
      className={`w-full text-left px-3 py-2 rounded-lg transition-all duration-200 flex items-center gap-3 text-[13px] ${navButtonClass(isActive, variant)}`}
    >
      {icon}
      {label}
    </Link>
  );
}

function DashboardSidebarSkeleton() {
  return (
    <div className="p-6 animate-pulse" aria-hidden="true">
      <div className="mb-8 space-y-2">
        <div className="h-7 w-28 rounded-lg bg-slate-800/80" />
        <div className="h-3 w-36 rounded bg-slate-800/50" />
      </div>

      <div className="space-y-8">
        <div className="space-y-3">
          <div className="h-3 w-24 rounded bg-slate-800/60" />
          <div className="h-9 rounded-lg bg-slate-800/50" />
          <div className="h-9 rounded-lg bg-slate-800/40" />
        </div>

        <div className="space-y-3">
          <div className="h-3 w-28 rounded bg-slate-800/60" />
          <div className="h-9 rounded-lg bg-slate-800/50" />
          <div className="h-9 rounded-lg bg-slate-800/40" />
          <div className="h-9 rounded-lg bg-slate-800/40" />
        </div>
      </div>
    </div>
  );
}

export default function DashboardSidebar() {
  const pathname = usePathname();
  const {
    authLoading,
    isBusinessAccount,
    isEmployeeAccount,
    showTalentPoolNav,
    setMobileNavOpen,
  } = useDashboardNav();

  if (authLoading) {
    return <DashboardSidebarSkeleton />;
  }

  return (
    <div className="p-6">
      <Link href="/" className="block mb-8 hover:opacity-90 transition-opacity">
        <ProvixLogo />
        <span className="text-[10px] text-slate-400 font-medium tracking-widest uppercase mt-2 block">
          Verified Intelligence
        </span>
      </Link>

      <div className="space-y-8">
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
              <DashboardTabLink
                tab="opportunities"
                label="Opportunities"
                icon={<DashboardIcons.Compass />}
              />
            )}
          </nav>
        </div>

        {!isBusinessAccount && !isEmployeeAccount && (
          <div>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-3 px-2">
              Career Accelerator
            </span>
            <nav className="space-y-1">
              <Link
                href="/dashboard/pitch-studio"
                onClick={() => setMobileNavOpen(false)}
                className={`w-full text-left px-3 py-2 rounded-lg transition-all duration-200 flex items-center gap-3 text-[13px] ${navButtonClass(isPitchStudioPath(pathname))}`}
              >
                <PenTool className="w-4 h-4" aria-hidden="true" /> Pitch Studio
              </Link>
              <Link
                href="/dashboard/auditor"
                onClick={() => setMobileNavOpen(false)}
                className={`w-full text-left px-3 py-2 rounded-lg transition-all duration-200 flex items-center gap-3 text-[13px] ${navButtonClass(isAuditorPath(pathname))}`}
              >
                <ShieldCheck className="w-4 h-4" aria-hidden="true" /> GitHub &amp;
                Resume Auditor
              </Link>
              <Link
                href="/dashboard/interview-prep"
                onClick={() => setMobileNavOpen(false)}
                className={`w-full text-left px-3 py-2 rounded-lg transition-all duration-200 flex items-center gap-3 text-[13px] ${navButtonClass(isInterviewPrepPath(pathname))}`}
              >
                <Terminal className="w-4 h-4" aria-hidden="true" /> Interview Simulator
              </Link>
            </nav>
          </div>
        )}

        {isEmployeeAccount && (
          <div>
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
          <div>
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
    </div>
  );
}
