"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { isFirewallPath } from "@/lib/dashboard-account";
import {
  firewallHref,
  useFirewallView,
  type FirewallView,
} from "@/components/firewall/firewall-view-context";

const VIEWS = [
  { key: "firewall" as const, label: "Architecture Firewall" },
  { key: "health" as const, label: "Integrity" },
  { key: "violations" as const, label: "Violations" },
  { key: "leaks" as const, label: "Leaks" },
];

export default function DashboardTopNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { activeView, repoSlug, setActiveView } = useFirewallView();
  const onFirewall = isFirewallPath(pathname);
  const onHistory = pathname === "/history" || pathname.startsWith("/history/");
  const onSettings = pathname.startsWith("/dashboard/settings");

  function openView(view: FirewallView) {
    if (onFirewall) {
      setActiveView(view);
      return;
    }
    router.push(firewallHref(repoSlug, view));
  }

  return (
    <nav className="flex items-center gap-5 overflow-x-auto" aria-label="Workspace">
      {VIEWS.map((view) => {
        const active = onFirewall && activeView === view.key;
        return (
          <button
            key={view.key}
            type="button"
            onClick={() => openView(view.key)}
            className={`shrink-0 text-sm font-medium ${active ? "text-white" : "text-zinc-400 hover:text-zinc-200"}`}
            aria-current={active ? "page" : undefined}
          >
            {view.label}
          </button>
        );
      })}
      <Link
        href="/history"
        className={`shrink-0 text-sm font-medium ${onHistory ? "text-white" : "text-zinc-400 hover:text-zinc-200"}`}
        aria-current={onHistory ? "page" : undefined}
      >
        History
      </Link>
      <Link
        href="/dashboard/settings"
        className={`shrink-0 text-sm font-medium ${onSettings ? "text-white" : "text-zinc-400 hover:text-zinc-200"}`}
        aria-current={onSettings ? "page" : undefined}
      >
        Team settings
      </Link>
    </nav>
  );
}
