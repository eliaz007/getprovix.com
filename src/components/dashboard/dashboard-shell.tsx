"use client";

import {
  useLayoutEffect,
  useRef,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import EmployerNotificationBell from "@/components/EmployerNotificationBell";
import GuestAuthModal from "@/components/GuestAuthModal";
import DashboardSidebar from "@/components/dashboard/dashboard-sidebar";
import DashboardSkeleton from "@/components/dashboard/dashboard-skeleton";
import MobileAppHeader from "@/components/dashboard/mobile-app-header";
import GetVerifiedBanner from "@/components/GetVerifiedBanner";
import { DashboardIcons } from "@/components/dashboard/dashboard-icons";
import { useDashboardNav } from "@/components/dashboard/dashboard-nav-context";
import { dashboardRouteHoldsChromeUntilContent } from "@/lib/dashboard-account";

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
    contentReady,
    isBusinessAccount,
    isVerifiedEmployer,
    isGuest,
    mobileNavOpen,
    setMobileNavOpen,
    userId,
    userAvatarUrl,
    userInitials,
    onOpenJobApplicants,
    requireAuth,
    authModalOpen,
    authModalError,
    setAuthModalOpen,
    setAuthModalError,
  } = useDashboardNav();

  // Nested dashboard routes must not hang forever when they forget (or never
  // needed) DashboardContentGate. Only the profile-studio root waits on it.
  const holdShell =
    authLoading ||
    (dashboardRouteHoldsChromeUntilContent(pathname) && !contentReady);

  return (
    <div className="h-screen overflow-hidden bg-background text-textMain font-sans antialiased selection:bg-brand/30">
      {holdShell ? <DashboardSkeleton /> : null}

      <div
        className={
          holdShell ? "hidden" : "flex h-full overflow-hidden animate-fadeIn"
        }
        aria-hidden={holdShell}
        inert={holdShell}
      >
        <aside className="hidden md:flex w-64 h-screen sticky top-0 shrink-0 flex-col bg-panel border-r border-border z-20 overflow-y-auto">
          <DashboardSidebar />
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <MobileAppHeader
            onOpenMenu={() => setMobileNavOpen(true)}
            onSignIn={() => requireAuth()}
            isGuest={isGuest}
            authLoading={authLoading}
            avatarUrl={userAvatarUrl}
            initials={userInitials}
            trailing={
              !isGuest && isBusinessAccount ? (
                <EmployerNotificationBell
                  userId={userId}
                  onOpenJobApplicants={(jobId) => onOpenJobApplicants?.(jobId)}
                />
              ) : null
            }
          />

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
              className={`fixed inset-y-0 left-0 z-50 flex w-64 max-w-[85vw] flex-col overflow-y-auto border-r border-border bg-panel transition-transform duration-300 ease-in-out motion-reduce:transition-none ${
                mobileNavOpen
                  ? "translate-x-0"
                  : "pointer-events-none -translate-x-full"
              }`}
            >
              <div className="flex items-center justify-end p-3 border-b border-border shrink-0">
                <button
                  type="button"
                  onClick={() => setMobileNavOpen(false)}
                  aria-label="Close menu"
                  tabIndex={mobileNavOpen ? 0 : -1}
                  className="p-2 rounded-lg text-textMuted hover:bg-panel hover:text-textMain transition-colors duration-200 ease-out cursor-pointer"
                >
                  <DashboardIcons.XMark />
                </button>
              </div>
              <DashboardSidebar />
            </aside>
          </div>

          <main className="relative min-h-0 w-full flex-1 flex flex-col overflow-hidden bg-background">
            {!isGuest && isBusinessAccount && (
              <div className="hidden md:flex shrink-0 items-center justify-end px-6 md:px-12 pt-4">
                <EmployerNotificationBell
                  userId={userId}
                  onOpenJobApplicants={(jobId) => onOpenJobApplicants?.(jobId)}
                />
              </div>
            )}

            <div className="flex-1 overflow-x-hidden overflow-y-auto p-4 pt-8 sm:p-6 sm:pt-10 md:p-12">
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
      </div>
    </div>
  );
}
