"use client";

import { useEffect } from "react";
import DashboardPage from "../page";

export default function ProfilePage() {
  useEffect(() => {
    console.time("dashboard-profile:page-mount");
    return () => {
      console.timeEnd("dashboard-profile:page-mount");
    };
  }, []);

  return <DashboardPage />;
}
