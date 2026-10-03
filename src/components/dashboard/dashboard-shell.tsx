"use client";

import { type ReactNode } from "react";
import { usePathname } from "next/navigation";
import GuestAuthModal from "@/components/GuestAuthModal";
import CompanySetupModal from "@/components/dashboard/CompanySetupModal";
import DossierClaimBanner from "@/components/dashboard/dossier-claim-banner";
import DashboardSidebar from "@/components/dashboard/dashboard-sidebar";
import MobileAppHeader from "@/components/dashboard/mobile-app-header";
import GetVerifiedBanner from "@/components/GetVerifiedBanner";
import { useDashboardNav } from "@/components/dashboard/dashboard-nav-context";

export default function DashboardShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const {
    authLoading,
    isBusinessAccount,
    isVerifiedEmployer,
    isGuest,
    userId,
    userAvatarUrl,
    userInitials,
    mobileNavOpen,
    setMobileNavOpen,
    requireAuth,
    authModalOpen,
    authModalError,
    setAuthModalOpen,
    setAuthModalError,
  } = useDashboardNav();

  return (
    <div className="print-flow flex h-screen overflow-hidden bg-[#090A0F] text-zinc-100 font-sans antialiased selection:bg-brand/30 print:block print:h-auto print:overflow-hidden">
      <aside className="hidden h-screen w-64 shrink-0 flex-col overflow-y-auto border-r border-white/[0.08] bg-[#0E0E12] print:hidden! md:flex">
        <DashboardSidebar />
      </aside>

      <div className="print:hidden md:hidden">
        <button
          type="button"
          aria-label="Close navigation menu"
          aria-hidden={!mobileNavOpen}
          tabIndex={mobileNavOpen ? 0 : -1}
          onClick={() => setMobileNavOpen(false)}
          className={`fixed inset-0 z-40 cursor-pointer bg-black/60 transition-opacity duration-300 ease-in-out motion-reduce:transition-none ${
            mobileNavOpen
              ? "opacity-100"
              : "pointer-events-none opacity-0"
          }`}
        />
        <aside
          aria-hidden={!mobileNavOpen}
          inert={!mobileNavOpen}
          className={`fixed inset-y-0 left-0 z-50 w-64 max-w-[85vw] overflow-y-auto border-r border-white/[0.08] bg-[#0E0E12] transition-transform duration-300 ease-in-out motion-reduce:transition-none ${
            mobileNavOpen
              ? "translate-x-0"
              : "pointer-events-none -translate-x-full"
          }`}
        >
          <DashboardSidebar />
        </aside>
      </div>

      <div className="print-flow flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[#090A0F] print:block print:h-auto print:overflow-hidden">
        <MobileAppHeader
          onOpenMenu={() => setMobileNavOpen(true)}
          onSignIn={() => requireAuth()}
          isGuest={isGuest}
          authLoading={authLoading}
          avatarUrl={userAvatarUrl}
          initials={userInitials}
        />

        <main className="print-flow relative min-h-0 w-full flex-1 overflow-x-hidden overflow-y-auto bg-[#090A0F] text-zinc-100 print:h-auto print:overflow-hidden">
          <div className="print-flow mx-auto min-h-screen w-full max-w-6xl p-8 print:min-h-0 print:max-w-none print:p-0">
            <div className="print:hidden">
              {!isBusinessAccount ? <DossierClaimBanner /> : null}
              {!isGuest &&
              isBusinessAccount &&
              isVerifiedEmployer === false &&
              !authLoading ? (
                <div className="mb-6">
                  <GetVerifiedBanner userId={userId} />
                </div>
              ) : null}
            </div>
            <div key={pathname}>{children}</div>
          </div>
        </main>
      </div>

      <div className="print:hidden">
        <GuestAuthModal
          open={authModalOpen}
          error={authModalError}
          onClose={() => setAuthModalOpen(false)}
          onError={setAuthModalError}
        />
        <CompanySetupModal />
      </div>
    </div>
  );
}
