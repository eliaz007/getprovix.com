"use client";

import { useEffect, useState } from "react";
import { useDashboardNav } from "@/components/dashboard/dashboard-nav-context";
import {
  EMPTY_GITHUB_APP_INSTALLATIONS,
  type GithubAppInstallationsResponse,
} from "@/lib/github-app-status";

export type GithubAppInstallationState = GithubAppInstallationsResponse & {
  loading: boolean;
};

function isAbortError(error: unknown): boolean {
  if (error == null || typeof error !== "object") return false;
  const err = error as { name?: unknown; message?: unknown; code?: unknown };
  const name = String(err.name ?? "");
  if (name === "AbortError" || name === "TimeoutError") return true;
  // DOMException.ABORT_ERR
  if (err.code === 20) return true;
  return /aborted|AbortError/i.test(String(err.message ?? ""));
}

export function useGithubAppInstallation(): GithubAppInstallationState {
  const { authLoading, userId } = useDashboardNav();
  const [state, setState] = useState<GithubAppInstallationState>({
    ...EMPTY_GITHUB_APP_INSTALLATIONS,
    loading: true,
  });

  useEffect(() => {
    if (authLoading) {
      setState((current) => ({ ...current, loading: true }));
      return;
    }
    if (!userId) {
      setState({ ...EMPTY_GITHUB_APP_INSTALLATIONS, loading: false });
      return;
    }

    // Prefer an ignore-flag over AbortController.abort(): Next.js dev overlays often
    // surface `AbortError: signal is aborted without reason` from cleanup aborts
    // (especially under Strict Mode remount), even when the rejection is caught.
    let cancelled = false;
    setState((current) => ({ ...current, loading: true }));

    void fetch("/api/github/installations", { cache: "no-store" })
      .then(async (response) => {
        if (cancelled) return;
        const payload = (await response.json()) as GithubAppInstallationsResponse;
        if (cancelled) return;
        if (!response.ok) {
          // Don't claim "not installed" on API failure — that re-shows the
          // connect banner after every Google sign-in when the lookup blips.
          setState((current) => ({
            ...current,
            authenticated: true,
            loading: false,
          }));
          return;
        }
        setState({
          authenticated: payload.authenticated !== false,
          installed: Boolean(payload.installed),
          installationIds: Array.isArray(payload.installationIds) ? payload.installationIds : [],
          repositories: Array.isArray(payload.repositories) ? payload.repositories : [],
          primaryRepo: typeof payload.primaryRepo === "string" ? payload.primaryRepo : null,
          loading: false,
        });
      })
      .catch((error: unknown) => {
        if (cancelled || isAbortError(error)) return;
        setState((current) => ({
          ...current,
          authenticated: true,
          loading: false,
        }));
      });

    return () => {
      cancelled = true;
    };
  }, [authLoading, userId]);

  return state;
}
