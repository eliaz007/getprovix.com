"use client";

import {
  useLayoutEffect,
  useRef,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import GuestAuthModal from "@/components/GuestAuthModal";
import DashboardSkeleton from "@/components/dashboard/dashboard-skeleton";
import DashboardTopNav from "@/components/dashboard/dashboard-top-nav";
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
    authModalOpen,
    authModalError,
    setAuthModalOpen,
    setAuthModalError,
  } = useDashboardNav();

  const holdShell = authLoading || !contentReady;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#0B0B0D] text-textMain font-sans antialiased selection:bg-amber-500/30">
      {holdShell ? <DashboardSkeleton /> : null}

      <div
        className={
          holdShell
            ? "hidden"
            : "flex min-h-0 flex-1 flex-col overflow-hidden animate-fadeIn"
        }
        aria-hidden={holdShell}
        inert={holdShell}
      >
        <DashboardTopNav />

        <main className="relative min-h-0 w-full flex-1 overflow-x-hidden overflow-y-auto bg-[#0B0B0D]">
          <div className="mx-auto w-full max-w-6xl px-4 py-8">
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
