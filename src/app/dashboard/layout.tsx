"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import DashboardShell from "@/components/dashboard/dashboard-shell";
import {
  DashboardContentGate,
  DashboardNavProvider,
} from "@/components/dashboard/dashboard-nav-context";
import { isDashboardRootPath } from "@/lib/dashboard-account";

/**
 * Nested AI tool routes (Pitch Studio, Auditor, Interview Simulator) never
 * mount the root `/dashboard` page ContentGate. When leaving `/dashboard`,
 * that gate's cleanup sets `contentReady=false` and the shell skeleton
 * deadlocks unless a nested route marks ready again.
 */
function DashboardRouteReady({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isNestedToolRoute = !isDashboardRootPath(pathname);

  return (
    <>
      {isNestedToolRoute ? <DashboardContentGate ready /> : null}
      {children}
    </>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DashboardNavProvider>
      <DashboardShell>
        <DashboardRouteReady>{children}</DashboardRouteReady>
      </DashboardShell>
    </DashboardNavProvider>
  );
}
