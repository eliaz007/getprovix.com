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

function recordedPulls(payload: FirewallResolvedFilesResponse): Record<string, FirewallResolvedPull> {
  const pulls = payload.pulls ?? payload.filePaths.map((filePath) => ({ filePath, number: null, url: null }));
  const next: Record<string, FirewallResolvedPull> = {};
  for (const pull of pulls) next[pull.filePath] = pull;
  return next;
}

/**
 * Whether Provix can open PRs on this repo (GitHub App install / write token).
 * Shared by Violations + Leaks so Open Fix is hidden before a doomed request.
 */
export function useGithubRepoWriteAccess(repoSlug: string | null): GithubRepoWriteAccess {
  const [state, setState] = useState<GithubRepoWriteAccess>(
    repoSlug ? { ...DEFAULT, loading: true } : DEFAULT
  );

  useEffect(() => {
    if (!repoSlug) {
      setState(DEFAULT);
      return;
    }
    let active = true;
    setState({ ...DEFAULT, loading: true });
    void (async () => {
      try {
        const response = await fetch(`/api/firewall/autofix/pr?repo=${encodeURIComponent(repoSlug)}`);
        const payload = await readJsonResponse<FirewallResolvedFilesResponse>(response);
        if (!active) return;
        if (!response.ok || !payload.ok) {
          setState({
            loading: false,
            canOpenPullRequest: false,
            accessMessage: payload.message ?? "Provix cannot open pull requests on this repository.",
            recorded: {},
          });
          return;
        }
        setState({
          loading: false,
          canOpenPullRequest: payload.canOpenPullRequest !== false,
          accessMessage: payload.canOpenPullRequest === false ? payload.accessMessage ?? null : null,
          recorded: recordedPulls(payload),
        });
      } catch {
        if (!active) return;
        setState({
          loading: false,
          canOpenPullRequest: false,
          accessMessage: "Could not verify GitHub App access for this repository.",
          recorded: {},
        });
      }
    })();
    return () => {
      active = false;
    };
  }, [repoSlug]);

  return state;
}
