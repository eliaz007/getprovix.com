"use client";

import Link from "next/link";
import { type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Activity, History, ScrollText, Settings, Shield, ShieldAlert } from "lucide-react";
import { isFirewallPath } from "@/lib/dashboard-account";
import { ProvixLogo } from "@/components/ProvixLogo";
import { useDashboardNav } from "@/components/dashboard/dashboard-nav-context";
import {
  firewallHref,
  useFirewallView,
  type FirewallView,
} from "@/components/firewall/firewall-view-context";

const navListClass = "m-0 flex list-none flex-col gap-0.5 p-0";
const sectionHeaderClass =
  "mb-1 block px-3 font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-500";

function navItemClass(isActive: boolean) {
  return `w-full text-left px-3 py-2 text-sm font-medium flex items-center gap-3 cursor-pointer transition-colors ${
    isActive
      ? "bg-white/[0.06] text-white font-medium rounded-lg"
      : "text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.04] rounded-lg"
  }`;
}

function SidebarBrand() {
  return (
    <Link
      href="/firewall"
      prefetch
      className="mb-6 flex items-center gap-2.5 px-3 py-1.5 transition-opacity hover:opacity-90"
    >
      <ProvixLogo className="h-6 w-6" showText={false} />
      <span className="text-base font-semibold tracking-tight text-white">PROVIX</span>
    </Link>
  );
}

function NavSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <span className={sectionHeaderClass}>{title}</span>
      <ul className={navListClass}>{children}</ul>
    </div>
  );
}

export default function DashboardSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { activeView, repoSlug, securityCount, setActiveView } = useFirewallView();
  const { authLoading, isGuest, requireAuth, setMobileNavOpen, userDisplayName, userInitials } =
    useDashboardNav();
  const onFirewall = isFirewallPath(pathname);
  const onHistory = pathname === "/history" || pathname.startsWith("/history/");
  const onSettings = pathname === "/dashboard/settings" || pathname.startsWith("/dashboard/settings/");
  const active = onSettings ? "settings" : onFirewall ? activeView : "";

  function openFirewallView(view: FirewallView) {
    setMobileNavOpen(false);
    if (onFirewall) {
      setActiveView(view);
      return;
    }
    router.push(firewallHref(repoSlug, view));
  }

  const workspaceLinks = [
    { key: "firewall" as const, label: "Architecture Firewall", icon: ShieldAlert },
    { key: "health" as const, label: "Integrity", icon: Activity },
    { key: "violations" as const, label: "Violations", icon: ScrollText },
    { key: "leaks" as const, label: "Leaks", icon: Shield },
  ];

  return (
    <div className="flex min-h-screen flex-col justify-between bg-[#0E0E12] p-4">
      <div>
        <SidebarBrand />
        <NavSection title="Workspace">
          {workspaceLinks.map((item) => {
            const Icon = item.icon;
            const isActive = active === item.key;
            return (
              <li key={item.key}>
                <button
                  type="button"
                  onClick={() => openFirewallView(item.key)}
                  className={navItemClass(isActive)}
                  aria-current={isActive ? "page" : undefined}
                >
                  <Icon
                    className={`h-4 w-4 shrink-0 ${isActive ? "text-violet-300" : "text-zinc-400"}`}
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                  <span className="truncate">{item.label}</span>
                  {item.key === "leaks" && securityCount !== null ? (
                    <span
                      className={`ml-auto rounded px-1.5 py-0.5 font-mono text-[10px] tabular-nums ${
                        securityCount > 0
                          ? "border border-red-500/30 bg-red-500/10 text-red-300"
                          : "border border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                      }`}
                    >
                      {securityCount}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
            <li>
              <Link
                href="/history"
                className={navItemClass(onHistory)}
                aria-current={onHistory ? "page" : undefined}
              >
                <History
                  className={`h-4 w-4 shrink-0 ${onHistory ? "text-violet-300" : "text-zinc-400"}`}
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
                <span className="truncate">History</span>
              </Link>
            </li>
        </NavSection>

        <div className="mt-5">
          <NavSection title="Account">
            <li>
              {isGuest ? (
                <button
                  type="button"
                  onClick={() => {
                    setMobileNavOpen(false);
                    requireAuth();
                  }}
                  className={navItemClass(false)}
                >
                  <Settings className="h-4 w-4 shrink-0 text-zinc-400" strokeWidth={1.5} aria-hidden="true" />
                  <span className="truncate">Team settings</span>
                </button>
              ) : (
                <Link
                  href="/dashboard/settings"
                  prefetch
                  onClick={() => setMobileNavOpen(false)}
                  className={navItemClass(active === "settings")}
                  aria-current={active === "settings" ? "page" : undefined}
                >
                  <Settings
                    className={`h-4 w-4 shrink-0 ${active === "settings" ? "text-violet-300" : "text-zinc-400"}`}
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                  <span className="truncate">Team settings</span>
                </Link>
              )}
            </li>
          </NavSection>
        </div>
      </div>

      <div className="mt-auto border-t border-white/[0.08] pt-3 print:hidden">
        {authLoading ? null : isGuest ? (
          <button
            type="button"
            onClick={() => {
              setMobileNavOpen(false);
              requireAuth();
            }}
            className="w-full cursor-pointer rounded-lg bg-[#F4F4F6] px-3 py-2 text-xs font-semibold text-[#0B0B0D] transition-colors hover:bg-white"
          >
            Sign in
          </button>
        ) : (
          <div className="flex items-center gap-2.5 rounded-lg border border-white/[0.08] bg-[#131316]/90 px-2.5 py-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-[11px] font-semibold text-zinc-100">
              {userInitials}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-200">
              {userDisplayName}
            </span>
            <Link
              href="/dashboard/settings"
              prefetch
              aria-label="Team settings"
              onClick={() => setMobileNavOpen(false)}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-[#1A1A1E] hover:text-zinc-200"
            >
              <Settings className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
