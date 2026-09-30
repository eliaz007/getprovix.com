"use client";

import { useEffect } from "react";
import DashboardPage from "../page";
import { DashboardContentGate } from "@/components/dashboard/dashboard-nav-context";

export default function ProfilePage() {
  useEffect(() => {
    console.time("dashboard-profile:page-mount");
    return () => {
      console.timeEnd("dashboard-profile:page-mount");
    };
  }, []);

  return (
    <>
      <DashboardContentGate ready />
      <DashboardPage />
    </>
  );
}
