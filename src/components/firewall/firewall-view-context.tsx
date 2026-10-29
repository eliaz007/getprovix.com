"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { toGitHubOwnerRepo } from "@/lib/github-repo-ref";

export type FirewallView = "firewall" | "health" | "violations";

type FirewallViewContextValue = {
  activeView: FirewallView;
  /** Locked `owner/repo` slug mirrored in `?repo=`. Never includes view names. */
  repoSlug: string | null;
  setActiveView: (view: FirewallView) => void;
  setRepoSlug: (repo: string | null) => void;
};

const FirewallViewContext = createContext<FirewallViewContextValue | null>(null);

const VIEW_VALUES = new Set<FirewallView>(["firewall", "health", "violations"]);

function isFirewallView(value: string | null | undefined): value is FirewallView {
  return value === "firewall" || value === "health" || value === "violations";
}

function readViewFromLocation(): FirewallView {
  const params = new URLSearchParams(window.location.search);
  const fromQuery = params.get("view")?.trim().toLowerCase() ?? "";
  if (isFirewallView(fromQuery)) return fromQuery;

  // Migrate legacy hash fragments once.
  const hash = window.location.hash.replace(/^#/, "").trim().toLowerCase();
  if (isFirewallView(hash)) return hash;
  return "firewall";
}

function readRepoFromLocation(): string | null {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("repo")?.trim() ?? "";
  if (!raw) return null;
  return toGitHubOwnerRepo(raw);
}

/**
 * Build `/firewall?repo=owner%2Frepo&view=…` from scratch.
 * `repo` is only written from the locked slug — never from a contaminated path.
 */
function buildFirewallHref(repoSlug: string | null, view: FirewallView): string {
  const params = new URLSearchParams();
  const clean = repoSlug ? toGitHubOwnerRepo(repoSlug) : null;
  if (clean) params.set("repo", clean);
  if (view !== "firewall") params.set("view", view);
  const query = params.toString();
  return `/firewall${query ? `?${query}` : ""}`;
}

function replaceFirewallUrl(repoSlug: string | null, view: FirewallView) {
  if (typeof window === "undefined") return;
  if (!window.location.pathname.startsWith("/firewall")) return;
  const next = buildFirewallHref(repoSlug, view);
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (current !== next) {
    window.history.replaceState(null, "", next);
  }
}

export function FirewallViewProvider({ children }: { children: ReactNode }) {
  const [activeView, setView] = useState<FirewallView>("firewall");
  const [repoSlug, setRepoSlugState] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Read the address bar once after mount — never during render.
  useEffect(() => {
    setView(readViewFromLocation());
    setRepoSlugState(readRepoFromLocation());
    setHydrated(true);
  }, []);

  // Mirror locked repo + active view into the URL after state commits.
  useEffect(() => {
    if (!hydrated) return;
    replaceFirewallUrl(repoSlug, activeView);
  }, [hydrated, repoSlug, activeView]);

  const setActiveView = useCallback((view: FirewallView) => {
    if (!VIEW_VALUES.has(view)) return;
    setView(view);
  }, []);

  const setRepoSlug = useCallback((repo: string | null) => {
    setRepoSlugState(repo ? toGitHubOwnerRepo(repo) : null);
  }, []);

  const value = useMemo(
    () => ({ activeView, repoSlug, setActiveView, setRepoSlug }),
    [activeView, repoSlug, setActiveView, setRepoSlug]
  );

  return <FirewallViewContext.Provider value={value}>{children}</FirewallViewContext.Provider>;
}

export function useFirewallView() {
  const value = useContext(FirewallViewContext);
  if (!value) {
    throw new Error("useFirewallView must be used inside FirewallViewProvider");
  }
  return value;
}

export function firewallHref(repoSlug: string | null, view: FirewallView = "firewall"): string {
  return buildFirewallHref(repoSlug, view);
}
