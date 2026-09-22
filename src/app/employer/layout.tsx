"use client";

import type { ReactNode } from "react";
import DashboardShell from "@/components/dashboard/dashboard-shell";
import {
  DashboardContentGate,
  DashboardNavProvider,
} from "@/components/dashboard/dashboard-nav-context";

function EmployerReady({ children }: { children: ReactNode }) {
  return (
    <>
      <DashboardContentGate ready />
      {children}
    </>
  );
}

export default function EmployerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DashboardNavProvider>
      <DashboardShell>
        <EmployerReady>{children}</EmployerReady>
      </DashboardShell>
    </DashboardNavProvider>
  );
}
