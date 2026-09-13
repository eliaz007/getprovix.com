"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, FileCode2, Loader2, ShieldCheck } from "lucide-react";
import { fetchWithAuth } from "@/lib/fetch-with-auth";
import { readJsonResponse } from "@/lib/read-json-response";
import { parseGitHubUrl } from "@/lib/validate-github-url";

export const GITHUB_CACHE_RETRY_MESSAGE =
  "GitHub's cache might take 10 seconds to update, please try again";

const TOKEN_STORAGE_KEY = "provix.repoVerificationToken";
const PROVIX_FILENAME = "provix.txt";

type VerifyRepoResponse = {
  error?: string;
  verified?: boolean;
  already_verified?: boolean;
  repo_url?: string;
  branch?: string;
};

function createVerificationToken(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().replace(/-/g, "");
  }

  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function readOrCreateToken(): string {
  try {
    const stored = sessionStorage.getItem(TOKEN_STORAGE_KEY)?.trim();
    if (stored) {
      return stored;
    }
  } catch {
    // sessionStorage can throw in private browsing.
  }

  const token = createVerificationToken();
  try {
    sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
  } catch {
    // Keep the in-memory token even if persistence fails.
  }
  return token;
}

function isGithubLookupFailure(status: number, message: string): boolean {
  if (status === 404 || status === 502 || status === 504) {
    return true;
  }

  return /not found|could not reach github|timed out/i.test(message);
}

export default function RepoOwnershipVerifier({
  repoUrl,
  onVerified,
  variant = "card",
}: {
  repoUrl: string;
  onVerified?: (result: { repoUrl: string; branch?: string }) => void;
  variant?: "card" | "banner";
}) {
  const parsed = parseGitHubUrl(repoUrl);
  const canonicalRepoUrl =
    parsed?.repo != null
      ? `https://github.com/${parsed.owner}/${parsed.repo}`
      : "";

  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);
  const [verifiedBranch, setVerifiedBranch] = useState<string | null>(null);
  const hasAttemptedFetch = useRef(false);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setToken(readOrCreateToken());

    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setVerified(false);
    setVerifiedBranch(null);
    setError(null);
    hasAttemptedFetch.current = false;
  }, [canonicalRepoUrl]);

  const copyToken = async () => {
    if (!token) {
      return;
    }

    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
      copyTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
    } catch (copyError) {
      console.error("[verify-repo] clipboard copy failed:", copyError);
      setError("Could not copy the token. Select it and copy manually.");
    }
  };

  const verifyOwnership = async () => {
    if (loading || verified || !canonicalRepoUrl || !token) {
      return;
    }

    setLoading(true);
    setError(null);

    const isInitialFetch = !hasAttemptedFetch.current;

    try {
      const response = await fetchWithAuth("/api/verify-repo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repo_url: canonicalRepoUrl,
          token,
        }),
      });

      const payload = (await readJsonResponse<VerifyRepoResponse>(response).catch(
        () => null
      )) as VerifyRepoResponse | null;

      if (response.status === 401) {
        setError("Sign in to verify repository ownership.");
        return;
      }

      hasAttemptedFetch.current = true;

      if (response.ok && payload?.verified) {
        setVerified(true);
        setVerifiedBranch(payload.branch ?? null);
        onVerified?.({
          repoUrl: payload.repo_url ?? canonicalRepoUrl,
          branch: payload.branch,
        });
        return;
      }

      const apiMessage = payload?.error?.trim() || "";

      if (isInitialFetch && isGithubLookupFailure(response.status, apiMessage)) {
        setError(GITHUB_CACHE_RETRY_MESSAGE);
        return;
      }

      setError(apiMessage || "Could not verify repository ownership.");
    } catch (verifyError) {
      console.error("[verify-repo] client request failed:", verifyError);
      hasAttemptedFetch.current = true;
      if (isInitialFetch) {
        setError(GITHUB_CACHE_RETRY_MESSAGE);
        return;
      }
      setError("Could not verify repository ownership. Try again.");
    } finally {
      setLoading(false);
    }
  };

  if (!canonicalRepoUrl) {
    return null;
  }

  if (variant === "banner") {
    return (
      <section
        className="rounded-xl border border-brand/25 bg-brandGlow px-3 py-2.5 sm:px-4"
        aria-labelledby="repo-ownership-heading"
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${
                verified
                  ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-300"
                  : "border-brand/30 bg-brand/15 text-brand"
              }`}
            >
              <ShieldCheck className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0">
              <p
                id="repo-ownership-heading"
                className="text-[11px] font-bold uppercase tracking-widest text-brand"
              >
                {PROVIX_FILENAME}
              </p>
              <p className="truncate text-xs text-textMuted">
                {verified
                  ? `Ownership verified${verifiedBranch ? ` on ${verifiedBranch}` : ""}`
                  : "Commit this token at the repo root, then verify"}
              </p>
            </div>
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
            <label htmlFor="provix-verification-token" className="sr-only">
              {PROVIX_FILENAME} contents
            </label>
            <input
              id="provix-verification-token"
              readOnly
              value={token}
              spellCheck={false}
              className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs text-textMain focus:border-brand focus:outline-none"
            />
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => void copyToken()}
                disabled={!token}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-panel px-2.5 py-2 text-[11px] font-semibold text-textMain transition-colors hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" aria-hidden />
                    Copy
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => void verifyOwnership()}
                disabled={loading || verified || !token}
                aria-busy={loading}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-brand px-3 py-2 text-[11px] font-bold tracking-tight text-white transition-colors duration-200 ease-out hover:bg-brandHover disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    Verifying...
                  </>
                ) : verified ? (
                  <>
                    <Check className="h-3.5 w-3.5" aria-hidden />
                    Verified
                  </>
                ) : (
                  "Verify Ownership"
                )}
              </button>
            </div>
          </div>
        </div>
        {error ? (
          <p role="alert" className="mt-2 text-xs text-amber-100">
            {error}
          </p>
        ) : null}
      </section>
    );
  }

  return (
    <section
      className="rounded-xl border border-brand/25 bg-brandGlow p-4 sm:p-5"
      aria-labelledby="repo-ownership-heading"
    >
      <p className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-brand">
        <ShieldCheck className="h-4 w-4" aria-hidden />
        Ownership
      </p>
      <h3
        id="repo-ownership-heading"
        className="mt-2 text-sm font-bold tracking-tight text-textMain"
      >
        Prove you own this repository
      </h3>
      <p className="mt-2 text-xs leading-relaxed text-textMuted">
        Commit a <span className="font-mono text-textMain">{PROVIX_FILENAME}</span>{" "}
        file at the repo root on <span className="font-mono text-textMain">main</span>{" "}
        or <span className="font-mono text-textMain">master</span>, then verify.
        GitHub sometimes serves a cached 404 for a few seconds after you push.
      </p>

      <ol className="mt-4 list-decimal space-y-2 pl-4 text-xs leading-relaxed text-textMuted">
        <li>
          Create <span className="font-mono text-textMain">{PROVIX_FILENAME}</span> in
          the root of{" "}
          <span className="break-all font-mono text-textMain">{canonicalRepoUrl}</span>
          .
        </li>
        <li>Paste the token below as the only file contents — no extra lines or quotes.</li>
        <li>
          Commit and push to <span className="font-mono text-textMain">main</span> or{" "}
          <span className="font-mono text-textMain">master</span>.
        </li>
        <li>Click Verify Ownership. If GitHub has not picked up the file yet, wait and retry.</li>
      </ol>

      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <label
            htmlFor="provix-verification-token"
            className="text-[11px] font-bold uppercase tracking-wide text-textMuted"
          >
            {PROVIX_FILENAME} contents
          </label>
          <button
            type="button"
            onClick={() => void copyToken()}
            disabled={!token}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-panel px-2.5 py-1 text-[11px] font-semibold text-textMain transition-colors hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden />
                Copied
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" aria-hidden />
                Copy token
              </>
            )}
          </button>
        </div>
        <div className="relative">
          <FileCode2
            className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-textMuted"
            aria-hidden
          />
          <textarea
            id="provix-verification-token"
            readOnly
            value={token}
            rows={2}
            spellCheck={false}
            className="w-full resize-none rounded-xl border border-border bg-background py-2.5 pl-9 pr-3 font-mono text-xs text-textMain focus:border-brand focus:outline-none"
          />
        </div>
      </div>

      {verified ? (
        <p
          role="status"
          className="mt-4 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2.5 text-sm text-emerald-200"
        >
          Ownership verified
          {verifiedBranch ? ` on ${verifiedBranch}` : ""}. This repository is now
          linked to your Provix account.
        </p>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-100"
        >
          {error}
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => void verifyOwnership()}
        disabled={loading || verified || !token}
        aria-busy={loading}
        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md bg-brand px-4 py-3 text-xs font-bold tracking-tight text-white transition-colors duration-200 ease-out hover:bg-brandHover disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Verifying ownership...
          </>
        ) : verified ? (
          <>
            <Check className="h-4 w-4" aria-hidden />
            Ownership verified
          </>
        ) : (
          "Verify Ownership"
        )}
      </button>
    </section>
  );
}
