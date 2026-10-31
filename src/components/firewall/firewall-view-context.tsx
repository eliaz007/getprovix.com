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

export type FirewallView = "firewall" | "health" | "violations" | "leaks";
export type IntegrityPane = "stream" | "integrity";

type FirewallViewContextValue = {
  activeView: FirewallView;
  /** Locked `owner/repo` slug mirrored in `?repo=`. Never includes view names. */
  repoSlug: string | null;
  integrityPane: IntegrityPane;
  securityCount: number | null;
  setActiveView: (view: FirewallView) => void;
  setRepoSlug: (repo: string | null) => void;
  setIntegrityPane: (pane: IntegrityPane) => void;
  setSecurityCount: (count: number | null) => void;
};

const FirewallViewContext = createContext<FirewallViewContextValue | null>(null);

const VIEW_VALUES = new Set<FirewallView>(["firewall", "health", "violations", "leaks"]);

function isFirewallView(value: string | null | undefined): value is FirewallView {
  return value === "firewall" || value === "health" || value === "violations" || value === "leaks";
}

function normalizeView(value: string): FirewallView | null {
  const view = value.trim().toLowerCase();
  if (view === "security") return "leaks";
  // The old Architecture Firewall screen now lives on Integrity.
  if (view === "firewall") return "health";
  return isFirewallView(view) ? view : null;
}

function readViewFromLocation(): FirewallView {
  const params = new URLSearchParams(window.location.search);
  const fromQuery = normalizeView(params.get("view") ?? "");
  if (fromQuery) return fromQuery;

  // Migrate legacy hash fragments once.
  const hash = window.location.hash.replace(/^#/, "");
  return normalizeView(hash) ?? "health";
}

function readRepoFromLocation(): string | null {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("repo")?.trim() ?? "";
  if (!raw) return null;
  return toGitHubOwnerRepo(raw);
}

function readIntegrityPane(): IntegrityPane {
  const pane = new URLSearchParams(window.location.search).get("pane");
  return pane === "integrity" ? "integrity" : "stream";
}

/**
 * Build `/firewall?repo=owner%2Frepo&view=…` from scratch.
 * `repo` is only written from the locked slug — never from a contaminated path.
 */
function buildFirewallHref(repoSlug: string | null, view: FirewallView, pane: IntegrityPane = "stream"): string {
  const params = new URLSearchParams();
  const clean = repoSlug ? toGitHubOwnerRepo(repoSlug) : null;
  const canonical = view === "firewall" ? "health" : view;
  if (clean) params.set("repo", clean);
  if (canonical !== "health") params.set("view", canonical);
  if (canonical === "health" && pane === "integrity") params.set("pane", "integrity");
  const query = params.toString();
  return `/firewall${query ? `?${query}` : ""}`;
}

function replaceFirewallUrl(repoSlug: string | null, view: FirewallView, pane: IntegrityPane) {
  if (typeof window === "undefined") return;
  if (!window.location.pathname.startsWith("/firewall")) return;
  const next = buildFirewallHref(repoSlug, view, pane);
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (current !== next) {
    window.history.replaceState(null, "", next);
  }
}

export function FirewallViewProvider({ children }: { children: ReactNode }) {
  const [activeView, setView] = useState<FirewallView>("health");
  const [repoSlug, setRepoSlugState] = useState<string | null>(null);
  const [integrityPane, setIntegrityPaneState] = useState<IntegrityPane>("stream");
  const [securityCount, setSecurityCountState] = useState<number | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Read the address bar once after mount — never during render.
  useEffect(() => {
    setView(readViewFromLocation());
    setRepoSlugState(readRepoFromLocation());
    setIntegrityPaneState(readIntegrityPane());
    setHydrated(true);
  }, []);

  // Mirror locked repo + active view into the URL after state commits.
  useEffect(() => {
    if (!hydrated) return;
    replaceFirewallUrl(repoSlug, activeView, integrityPane);
  }, [hydrated, repoSlug, activeView, integrityPane]);

  const setActiveView = useCallback((view: FirewallView) => {
    if (!VIEW_VALUES.has(view)) return;
    setView(view === "firewall" ? "health" : view);
  }, []);

  const setRepoSlug = useCallback((repo: string | null) => {
    setRepoSlugState(repo ? toGitHubOwnerRepo(repo) : null);
  }, []);

  const setIntegrityPane = useCallback((pane: IntegrityPane) => {
    setIntegrityPaneState(pane === "integrity" ? "integrity" : "stream");
  }, []);

  const setSecurityCount = useCallback((count: number | null) => {
    setSecurityCountState(count);
  }, []);

  const value = useMemo(
    () => ({
      activeView,
      repoSlug,
      integrityPane,
      securityCount,
      setActiveView,
      setRepoSlug,
      setIntegrityPane,
      setSecurityCount,
    }),
    [activeView, repoSlug, integrityPane, securityCount, setActiveView, setRepoSlug, setIntegrityPane, setSecurityCount]
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

export function firewallHref(repoSlug: string | null, view: FirewallView = "health", pane: IntegrityPane = "stream"): string {
  return buildFirewallHref(repoSlug, view, pane);
}
