"use client";

import { useRouter } from "next/navigation";
import { DashboardIcons } from "@/components/dashboard/dashboard-icons";
import { useDashboardNav } from "@/components/dashboard/dashboard-nav-context";

export default function DashboardUpgradeModal() {
  const router = useRouter();
  const { upgradeModalOpen, setUpgradeModalOpen } = useDashboardNav();

  if (!upgradeModalOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 max-w-sm w-full text-center relative">
        <button
          type="button"
          onClick={() => setUpgradeModalOpen(false)}
          className="absolute top-4 right-4 text-slate-500 hover:text-white transition-colors cursor-pointer"
        >
          <DashboardIcons.XMark />
        </button>

        <h3 className="text-xl font-bold text-white">Premium Feature Locked</h3>
        <p className="text-sm text-slate-400 mt-2">
          Upgrade your account to access advanced tools and analytics.
        </p>

        <div className="flex flex-col gap-3 mt-8">
          <button
            type="button"
            onClick={() => router.push("/pricing")}
            className="w-full bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-white font-semibold py-3 rounded-lg text-sm transition-all cursor-pointer"
          >
            Upgrade as Talent ($15/mo)
          </button>
          <button
            type="button"
            onClick={() => router.push("/pricing")}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 rounded-lg text-sm transition-all shadow-lg shadow-indigo-500/20 cursor-pointer"
          >
            Upgrade as Agency ($299/mo)
          </button>
        </div>
      </div>
    </div>
  );
}
