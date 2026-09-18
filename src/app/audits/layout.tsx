"use client";

import type { ReactNode } from "react";
import DashboardShell from "@/components/dashboard/dashboard-shell";
import {
  DashboardContentGate,
  DashboardNavProvider,
} from "@/components/dashboard/dashboard-nav-context";

function AuditsReady({ children }: { children: ReactNode }) {
  return (
    <>
      <DashboardContentGate ready />
      {children}
    </>
  );
}

export default function AuditsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DashboardNavProvider>
      <DashboardShell>
        <AuditsReady>{children}</AuditsReady>
      </DashboardShell>
    </DashboardNavProvider>
  );
}
