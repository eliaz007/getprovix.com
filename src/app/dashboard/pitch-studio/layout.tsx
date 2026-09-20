"use client";

import type { ReactNode } from "react";
import { DashboardContentGate } from "@/components/dashboard/dashboard-nav-context";

function PitchStudioReady({ children }: { children: ReactNode }) {
  return (
    <>
      <DashboardContentGate ready />
      {children}
    </>
  );
}

export default function PitchStudioLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PitchStudioReady>{children}</PitchStudioReady>;
}
