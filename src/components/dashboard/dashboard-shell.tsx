"use client";

import {
  useLayoutEffect,
  useRef,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import GuestAuthModal from "@/components/GuestAuthModal";
import CompanySetupModal from "@/components/dashboard/CompanySetupModal";
import DashboardSidebar from "@/components/dashboard/dashboard-sidebar";
import MobileAppHeader from "@/components/dashboard/mobile-app-header";
import GetVerifiedBanner from "@/components/GetVerifiedBanner";
import { useDashboardNav } from "@/components/dashboard/dashboard-nav-context";

function ContentFade({
  trigger,
  children,
}: {
  trigger: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.classList.remove("animate-fadeIn");
    void el.offsetWidth;
    el.classList.add("animate-fadeIn");
  }, [trigger]);

  return (
    <div ref={ref} className="animate-fadeIn">
      {children}
    </div>
  );
}

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
    <div className="flex h-screen overflow-hidden bg-[#0B0B0D] text-zinc-100 font-sans antialiased selection:bg-brand/30">
      <aside className="hidden h-screen w-64 shrink-0 flex-col overflow-y-auto border-r border-white/[0.08] bg-[#0E0E12] md:flex">
        <DashboardSidebar />
      </aside>

      <div className="md:hidden">
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

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <MobileAppHeader
          onOpenMenu={() => setMobileNavOpen(true)}
          onSignIn={() => requireAuth()}
          isGuest={isGuest}
          authLoading={authLoading}
          avatarUrl={userAvatarUrl}
          initials={userInitials}
        />

        <main className="relative min-h-0 w-full flex-1 overflow-x-hidden overflow-y-auto bg-[#0B0B0D] text-zinc-100">
          <div className="mx-auto min-h-screen w-full max-w-6xl p-8">
            {!isGuest &&
            isBusinessAccount &&
            !isVerifiedEmployer &&
            !authLoading ? (
              <div className="mb-6">
                <GetVerifiedBanner userId={userId} />
              </div>
            ) : null}
            <ContentFade trigger={pathname}>{children}</ContentFade>
          </div>
        </main>
      </div>

      <GuestAuthModal
        open={authModalOpen}
        error={authModalError}
        onClose={() => setAuthModalOpen(false)}
        onError={setAuthModalError}
      />
      <CompanySetupModal />
    </div>
  );
}
