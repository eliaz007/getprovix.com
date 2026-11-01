"use client";

import { useEffect, useState } from "react";
import type { FirewallResolvedFilesResponse, FirewallResolvedPull } from "@/lib/firewall-contract";
import { readJsonResponse } from "@/lib/read-json-response";

export type GithubRepoWriteAccess = {
  loading: boolean;
  canOpenPullRequest: boolean;
  accessMessage: string | null;
  recorded: Record<string, FirewallResolvedPull>;
};

const DEFAULT: GithubRepoWriteAccess = {
  loading: false,
  canOpenPullRequest: false,
  accessMessage: null,
  recorded: {},
};

/** One fetch per repo — Violations, Leaks, and every RemediationDiff share the same result. */
const cache = new Map<string, GithubRepoWriteAccess>();
const inflight = new Map<string, Promise<GithubRepoWriteAccess>>();

function recordedPulls(payload: FirewallResolvedFilesResponse): Record<string, FirewallResolvedPull> {
  const pulls = payload.pulls ?? payload.filePaths.map((filePath) => ({ filePath, number: null, url: null }));
  const next: Record<string, FirewallResolvedPull> = {};
  for (const pull of pulls) next[pull.filePath] = pull;
  return next;
}

async function fetchWriteAccess(repoSlug: string): Promise<GithubRepoWriteAccess> {
  const existing = inflight.get(repoSlug);
  if (existing) return existing;

  const request = (async (): Promise<GithubRepoWriteAccess> => {
    try {
      const response = await fetch(`/api/firewall/autofix/pr?repo=${encodeURIComponent(repoSlug)}`);
      const payload = await readJsonResponse<FirewallResolvedFilesResponse>(response);
      if (!response.ok || !payload.ok) {
        return {
          loading: false,
          canOpenPullRequest: false,
          accessMessage: payload.message ?? "Provix cannot open pull requests on this repository.",
          recorded: {},
        };
      }
      return {
        loading: false,
        canOpenPullRequest: payload.canOpenPullRequest !== false,
        accessMessage: payload.canOpenPullRequest === false ? payload.accessMessage ?? null : null,
        recorded: recordedPulls(payload),
      };
    } catch {
      return {
        loading: false,
        canOpenPullRequest: false,
        accessMessage: "Could not verify GitHub App access for this repository.",
        recorded: {},
      };
    }
  })();

  inflight.set(repoSlug, request);
  try {
    const result = await request;
    cache.set(repoSlug, result);
    return result;
  } finally {
    inflight.delete(repoSlug);
  }
}

/**
 * Whether Provix can open PRs on this repo (GitHub App install / write token).
 * Shared by Violations + Leaks so Open Fix is hidden before a doomed request.
 */
export function useGithubRepoWriteAccess(repoSlug: string | null): GithubRepoWriteAccess {
  const cached = repoSlug ? cache.get(repoSlug) : undefined;
  const [state, setState] = useState<GithubRepoWriteAccess>(() => {
    if (!repoSlug) return DEFAULT;
    if (cached) return cached;
    return { ...DEFAULT, loading: true };
  });

  useEffect(() => {
    if (!repoSlug) {
      setState(DEFAULT);
      return;
    }
    const hit = cache.get(repoSlug);
    if (hit) {
      setState(hit);
      return;
    }
    let active = true;
    setState({ ...DEFAULT, loading: true });
    void fetchWriteAccess(repoSlug).then((result) => {
      if (!active) return;
      setState(result);
    });
    return () => {
      active = false;
    };
  }, [repoSlug]);

  return state;
}
