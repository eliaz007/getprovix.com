"use client";

import DashboardShell from "@/components/dashboard/dashboard-shell";
import { DashboardNavProvider } from "@/components/dashboard/dashboard-nav-context";

export default function OpportunitiesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DashboardNavProvider>
      <DashboardShell>{children}</DashboardShell>
    </DashboardNavProvider>
  );
}
