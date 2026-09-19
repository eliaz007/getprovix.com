"use client";

import type { ReactNode } from "react";
import { DashboardContentGate } from "@/components/dashboard/dashboard-nav-context";

function AcceleratorRouteReady({ children }: { children: ReactNode }) {
  return (
    <>
      <DashboardContentGate ready />
      {children}
    </>
  );
}

export default function InterviewPrepLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AcceleratorRouteReady>{children}</AcceleratorRouteReady>;
}
