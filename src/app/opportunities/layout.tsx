"use client";

import type { ReactNode } from "react";
import DashboardShell from "@/components/dashboard/dashboard-shell";
import {
  DashboardContentGate,
  DashboardNavProvider,
} from "@/components/dashboard/dashboard-nav-context";

function OpportunitiesReady({ children }: { children: ReactNode }) {
  return (
    <>
      <DashboardContentGate ready />
      {children}
    </>
  );
}

export default function OpportunitiesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DashboardNavProvider>
      <DashboardShell>
        <OpportunitiesReady>{children}</OpportunitiesReady>
      </DashboardShell>
    </DashboardNavProvider>
  );
}
