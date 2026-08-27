"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import EmployerNotificationBell from "@/components/EmployerNotificationBell";
import GuestAuthModal from "@/components/GuestAuthModal";
import { ProvixLogo } from "@/components/ProvixLogo";
import DashboardSidebar from "@/components/dashboard/dashboard-sidebar";
import { DashboardIcons } from "@/components/dashboard/dashboard-icons";
import { useDashboardNav } from "@/components/dashboard/dashboard-nav-context";

export default function DashboardShell({ children }: { children: ReactNode }) {
  const {
    authLoading,
    isBusinessAccount,
    isGuest,
    mobileNavOpen,
    setMobileNavOpen,
    userId,
    onOpenJobApplicants,
    requireAuth,
    authModalOpen,
    authModalError,
    setAuthModalOpen,
    setAuthModalError,
  } = useDashboardNav();

  return (
    <div className="flex h-screen overflow-hidden bg-[#0A0A0A] text-slate-200 font-sans antialiased selection:bg-indigo-500/30">
      <aside className="hidden md:flex w-64 h-screen sticky top-0 shrink-0 flex-col bg-[#111111] border-r border-slate-800/60 z-20 overflow-y-auto">
        <DashboardSidebar />
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex md:hidden items-center justify-between px-4 py-3 bg-[#111111] border-b border-slate-800/60 shrink-0 z-20">
          <Link href="/" className="flex items-center gap-3 min-w-0 hover:opacity-90 transition-opacity">
            <ProvixLogo />
          </Link>
          <div className="flex items-center gap-1">
            {isGuest && !authLoading && (
              <button
                type="button"
                onClick={() => requireAuth()}
                className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-3 py-2 rounded-lg transition-all cursor-pointer"
              >
                Sign In
              </button>
            )}
            {!isGuest && isBusinessAccount && (
              <EmployerNotificationBell
                userId={userId}
                onOpenJobApplicants={(jobId) => onOpenJobApplicants?.(jobId)}
              />
            )}
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open navigation menu"
              className="md:hidden p-2 rounded-lg text-slate-300 hover:bg-slate-800/60 hover:text-white transition-colors cursor-pointer"
            >
              <DashboardIcons.Menu />
            </button>
          </div>
        </header>

        {mobileNavOpen && (
          <div className="md:hidden">
            <button
              type="button"
              aria-label="Close navigation menu"
              onClick={() => setMobileNavOpen(false)}
              className="fixed inset-0 bg-black/60 z-40 cursor-pointer"
            />
            <aside className="fixed inset-y-0 left-0 w-64 max-w-[85vw] bg-[#111111] border-r border-slate-800/60 flex flex-col z-50 shadow-2xl overflow-y-auto">
              <div className="flex items-center justify-end p-3 border-b border-slate-800/60 shrink-0">
                <button
                  type="button"
                  onClick={() => setMobileNavOpen(false)}
                  aria-label="Close menu"
                  className="p-2 rounded-lg text-slate-400 hover:bg-slate-800/60 hover:text-white transition-colors cursor-pointer"
                >
                  <DashboardIcons.XMark />
                </button>
              </div>
              <DashboardSidebar />
            </aside>
          </div>
        )}

        <main className="relative min-h-0 w-full flex-1 flex flex-col overflow-hidden bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#1a1a1a] via-[#0A0A0A] to-[#0A0A0A]">
          {!isGuest && isBusinessAccount && (
            <div className="hidden md:flex shrink-0 items-center justify-end px-6 md:px-12 py-3 border-b border-slate-800/60 bg-[#111111]/95">
              <EmployerNotificationBell
                userId={userId}
                onOpenJobApplicants={(jobId) => onOpenJobApplicants?.(jobId)}
              />
            </div>
          )}

          <div className="flex-1 overflow-x-hidden overflow-y-auto p-4 sm:p-6 md:p-12 animate-in fade-in duration-300">
            {children}
          </div>
        </main>
      </div>

      <GuestAuthModal
        open={authModalOpen}
        error={authModalError}
        onClose={() => setAuthModalOpen(false)}
        onError={setAuthModalError}
      />
    </div>
  );
}
