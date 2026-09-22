"use client";

import {
  useLayoutEffect,
  useRef,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import GuestAuthModal from "@/components/GuestAuthModal";
import DashboardSkeleton from "@/components/dashboard/dashboard-skeleton";
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
    contentReady,
    isBusinessAccount,
    isVerifiedEmployer,
    isGuest,
    userId,
    userAvatarUrl,
    userInitials,
    authModalOpen,
    authModalError,
    setAuthModalOpen,
    setAuthModalError,
    mobileNavOpen,
    setMobileNavOpen,
    requireAuth,
  } = useDashboardNav();

  const holdShell = authLoading || !contentReady;

  return (
    <div className="flex h-screen min-h-screen bg-[#0B0B0D] text-textMain font-sans antialiased selection:bg-amber-500/30">
      {holdShell ? <DashboardSkeleton /> : null}

      <div
        className={
          holdShell
            ? "hidden"
            : "flex h-full min-h-0 w-full animate-fadeIn"
        }
        aria-hidden={holdShell}
        inert={holdShell}
      >
        {/* Desktop sidebar */}
        <aside className="hidden h-full shrink-0 md:block">
          <DashboardSidebar />
        </aside>

        {/* Mobile drawer */}
        <div className="md:hidden">
          <button
            type="button"
            aria-label="Close navigation menu"
            aria-hidden={!mobileNavOpen}
            tabIndex={mobileNavOpen ? 0 : -1}
            onClick={() => setMobileNavOpen(false)}
            className={`fixed inset-0 z-40 cursor-pointer bg-black/60 transition-opacity duration-300 ease-in-out motion-reduce:transition-none ${
              mobileNavOpen
                ? "pointer-events-auto opacity-100"
                : "pointer-events-none opacity-0"
            }`}
          />
          <aside
            className={`fixed inset-y-0 left-0 z-50 transform transition-transform duration-300 ease-in-out motion-reduce:transition-none ${
              mobileNavOpen ? "translate-x-0" : "-translate-x-full"
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

          <main className="relative min-h-0 w-full flex-1 overflow-x-hidden overflow-y-auto bg-[#0B0B0D] p-8 text-zinc-100">
            <div className="mx-auto w-full max-w-6xl text-zinc-100">
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
