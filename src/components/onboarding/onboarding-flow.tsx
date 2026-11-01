"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  Building2,
  GitBranch,
  Loader2,
  Lock,
  Sparkles,
  User,
} from "lucide-react";
import { GitHubLogo, GitHubSignInButton } from "@/components/GitHubSignInButton";
import { ProvixLogo } from "@/components/ProvixLogo";
import AstTerminalMock from "@/components/onboarding/ast-terminal-mock";
import AuditProgressOverlay from "@/components/onboarding/audit-progress-overlay";
import {
  GITHUB_APP_CONNECT_PATH,
  GITHUB_APP_OAUTH_START_PATH,
  integrityDashboardPath,
} from "@/lib/github-app-install";
import type { GithubInstallationRepo } from "@/lib/github-app-client";
import type { OnboardingRepositoriesResponse } from "@/lib/onboarding-repos";
import { readJsonResponse } from "@/lib/read-json-response";
import type { FirewallResponse } from "@/lib/firewall-contract";
import {
  markOnboardingAuditComplete,
  readOnboardingAuditComplete,
  saveFirewallScanHandoff,
} from "@/lib/firewall-scan-handoff";
import { createClient } from "@/utils/supabase/client";

type WorkspaceKind = "solo" | "team";
type Phase = "boot" | "login" | "install" | "setup" | "auditing";

const WORKSPACE_KEY = "provix_onboarding_workspace";

function hardNavigate(path: string) {
  try {
    window.location.assign(path);
  } catch {
    window.location.href = path;
  }
}

function errorMessageFromSearch(): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const error = params.get("error")?.trim();
  if (!error) return null;
  if (error === "oauth_failed" || error === "github_oauth_failed") {
    return "GitHub authorization failed. Check App credentials, then try Authorize & install again.";
  }
  if (error === "github_app_not_configured") {
    return "Add GITHUB_APP_CLIENT_ID and GITHUB_APP_CLIENT_SECRET to .env.local, then restart the dev server.";
  }
  if (error === "github_app_slug_missing") {
    return "Add GITHUB_APP_SLUG to .env.local (from github.com/apps/<slug>), then restart npm run dev.";
  }
  if (error === "sign_in_required") {
    return "Sign in with GitHub first, then install the Provix App.";
  }
  return error;
}

export default function OnboardingFlow() {
  const [phase, setPhase] = useState<Phase>("boot");
  const [error, setError] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceKind>("solo");
  const [repos, setRepos] = useState<GithubInstallationRepo[]>([]);
  const [preferred, setPreferred] = useState<GithubInstallationRepo[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [installPending, setInstallPending] = useState(false);
  const [auditing, setAuditing] = useState(false);
  const [pillarsComplete, setPillarsComplete] = useState(false);
  const destinationRef = useRef<string | null>(null);
  const scanRef = useRef<Promise<void> | null>(null);
  const leavingRef = useRef(false);

  const displayRepos = useMemo(() => {
    const pool = preferred.length > 0 ? preferred : repos;
    return pool.slice(0, 12);
  }, [preferred, repos]);

  useEffect(() => {
    const stored = window.localStorage.getItem(WORKSPACE_KEY);
    if (stored === "solo" || stored === "team") setWorkspace(stored);
    setError(errorMessageFromSearch());
  }, []);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    async function boot() {
      const params = new URLSearchParams(window.location.search);
      const completed = params.get("error") ? null : readOnboardingAuditComplete();
      if (completed?.repo) {
        hardNavigate(integrityDashboardPath(completed.repo));
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;

      if (!user) {
        setPhase("login");
        return;
      }

      setLoadingRepos(true);
      try {
        const response = await fetch("/api/github/repositories", { cache: "no-store" });
        const payload = await readJsonResponse<OnboardingRepositoriesResponse>(response);
        if (cancelled) return;

        if (!payload.installed) {
          if (payload.message) setError(payload.message);
          setPhase("install");
          return;
        }

        setRepos(payload.repositories);
        setPreferred(payload.preferred);
        const fromQuery = new URLSearchParams(window.location.search).get("repo");
        const initial =
          (fromQuery && payload.repositories.some((r) => r.fullName === fromQuery)
            ? fromQuery
            : null) ??
          payload.primaryRepo ??
          payload.preferred[0]?.fullName ??
          payload.repositories[0]?.fullName ??
          null;
        setSelectedRepo(initial);
        setPhase("setup");
      } catch {
        if (!cancelled) {
          setError("Could not load GitHub repositories. Retry install or refresh.");
          setPhase("install");
        }
      } finally {
        if (!cancelled) setLoadingRepos(false);
      }
    }

    void boot();
    return () => {
      cancelled = true;
    };
  }, []);

  function chooseWorkspace(next: WorkspaceKind) {
    setWorkspace(next);
    window.localStorage.setItem(WORKSPACE_KEY, next);
  }

  function startGithubAppHandshake() {
    if (installPending) return;
    setInstallPending(true);
    hardNavigate(GITHUB_APP_OAUTH_START_PATH);
  }

  function fallbackInstall() {
    if (installPending) return;
    setInstallPending(true);
    hardNavigate(GITHUB_APP_CONNECT_PATH);
  }

  const handlePillarsComplete = useCallback(() => {
    setPillarsComplete(true);
  }, []);

  useEffect(() => {
    if (!pillarsComplete || leavingRef.current || !destinationRef.current || !scanRef.current) return;
    const destination = destinationRef.current;
    const scan = scanRef.current;
    void scan.then(() => {
      if (leavingRef.current) return;
      leavingRef.current = true;
      hardNavigate(destination);
    });
  }, [pillarsComplete]);

  async function runInitialAudit() {
    if (!selectedRepo || auditing) return;
    const repo = selectedRepo;
    const destination = integrityDashboardPath(repo);
    destinationRef.current = destination;
    setAuditing(true);
    setPillarsComplete(false);
    setPhase("auditing");
    setError(null);
    leavingRef.current = false;

    scanRef.current = (async () => {
      try {
        const response = await fetch("/api/firewall", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ source: "github", repoUrl: repo }),
        });
        const payload = await readJsonResponse<FirewallResponse>(response);
        if (response.ok && payload.status === "ready" && payload.report && payload.source === "github") {
          saveFirewallScanHandoff({
            repoUrl: repo,
            report: payload.report,
            note: payload.message ?? `Initial AST audit for ${repo}.`,
            source: "github",
          });
        }
      } catch {
        // Still enter the dashboard; firewall page can retry the scan.
      }
      markOnboardingAuditComplete(repo);
    })();
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-zinc-950 text-zinc-100">
      <AuditProgressOverlay
        open={auditing || phase === "auditing"}
        repo={selectedRepo}
        onComplete={handlePillarsComplete}
      />

      <AnimatePresence mode="wait">
        {phase === "boot" || (phase === "setup" && loadingRepos) ? (
          <motion.div
            key="boot"
            className="flex min-h-screen items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <Loader2 className="h-6 w-6 animate-spin text-violet-300" aria-hidden />
          </motion.div>
        ) : null}

        {phase === "login" ? (
          <motion.div
            key="login"
            className="grid min-h-screen lg:grid-cols-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
          >
            <section className="relative hidden overflow-hidden bg-zinc-950 lg:flex lg:flex-col lg:justify-between lg:px-10 lg:py-10 xl:px-14">
              <div
                className="pointer-events-none absolute inset-0"
                style={{
                  background:
                    "radial-gradient(ellipse 70% 55% at 30% 35%, rgba(124,58,237,0.28), transparent 60%), radial-gradient(ellipse 50% 40% at 80% 80%, rgba(16,185,129,0.08), transparent 55%)",
                }}
              />
              <div className="relative z-10">
                <ProvixLogo className="h-9 w-9" />
                <h1 className="mt-10 max-w-md text-4xl font-extrabold tracking-tight text-white xl:text-5xl">
                  Provix
                </h1>
                <p className="mt-4 max-w-sm text-sm leading-relaxed text-zinc-400">
                  Architecture Firewall watches your AST for auth gaps, RLS drift, and
                  client-side database leaks before they ship.
                </p>
              </div>
              <div className="relative z-10 mt-12">
                <AstTerminalMock />
              </div>
            </section>

            <section className="relative flex min-h-screen items-center justify-center px-6 py-16">
              <div
                className="pointer-events-none absolute inset-0 lg:hidden"
                style={{
                  background:
                    "radial-gradient(ellipse 80% 50% at 50% 0%, rgba(124,58,237,0.18), transparent 55%)",
                }}
              />
              <div className="relative z-10 w-full max-w-md">
                <div className="mb-10 lg:hidden">
                  <ProvixLogo />
                </div>
                <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-zinc-500">
                  Architecture Firewall
                </p>
                <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-white">
                  Sign in to Provix
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-zinc-400">
                  Connect GitHub to install the Provix App, pick a TypeScript repository, and
                  run your first AST audit.
                </p>

                {error ? (
                  <div className="mt-6 rounded-lg border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
                    {error}
                  </div>
                ) : null}

                <div className="mt-8">
                  <GitHubSignInButton
                    label="Continue with GitHub"
                    nextPath="/onboarding"
                    accountKind="candidate"
                    onError={(message) => setError(message || null)}
                    className="group inline-flex w-full items-center justify-center gap-3 rounded-xl border border-white/10 bg-white px-6 py-3.5 text-sm font-semibold tracking-tight text-zinc-950 transition-all duration-200 ease-out hover:-translate-y-0.5 hover:bg-zinc-100 hover:shadow-[0_0_0_1px_rgba(255,255,255,0.2),0_12px_40px_-12px_rgba(124,58,237,0.55)] disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>

                <p className="mt-8 text-center text-xs text-zinc-500">
                  Prefer email?{" "}
                  <Link href="/login" className="text-zinc-300 underline-offset-2 hover:underline">
                    Use the classic login
                  </Link>
                </p>
              </div>
            </section>
          </motion.div>
        ) : null}

        {phase === "install" ? (
          <motion.div
            key="install"
            className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-16"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <ProvixLogo />
            <h2 className="mt-10 text-3xl font-extrabold tracking-tight">
              Install the Provix GitHub App
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-zinc-400">
              After OAuth we hand off to GitHub so Provix can read the repositories you choose.
              You&apos;ll return here to pick a workspace and run the first audit.
            </p>
            {error ? (
              <div className="mt-6 rounded-lg border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
                {error}
              </div>
            ) : null}
            <button
              type="button"
              onClick={startGithubAppHandshake}
              disabled={installPending}
              className="mt-8 inline-flex w-full items-center justify-center gap-3 rounded-xl border border-violet-400/30 bg-violet-500/15 px-6 py-3.5 text-sm font-semibold text-violet-100 transition-all duration-200 hover:border-violet-300/50 hover:bg-violet-500/25 disabled:opacity-60"
            >
              <GitHubLogo />
              {installPending ? "Redirecting…" : "Authorize & install"}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </button>
            <button
              type="button"
              onClick={fallbackInstall}
              disabled={installPending}
              className="mt-3 text-center text-xs text-zinc-500 hover:text-zinc-300"
            >
              Skip OAuth and open install only
            </button>
            <p className="mt-4 text-center text-xs leading-relaxed text-zinc-500">
              Scans are read-only. Provix only writes or opens a pull request when you click{" "}
              <span className="text-zinc-300">Open Fix PR</span>.
            </p>
            <p className="mt-6 text-[11px] leading-relaxed text-zinc-600">
              Needs <span className="font-mono text-zinc-400">GITHUB_APP_SLUG</span> in{" "}
              <span className="font-mono text-zinc-400">.env.local</span> (and{" "}
              <span className="font-mono text-zinc-400">GITHUB_APP_PRIVATE_KEY</span> to list repos after
              install). Restart the server after saving.
            </p>
          </motion.div>
        ) : null}

        {phase === "setup" || phase === "auditing" ? (
          <motion.div
            key="setup"
            className="mx-auto min-h-screen max-w-3xl px-6 py-14"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <div className="flex items-center justify-between gap-4">
              <ProvixLogo />
              <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                First audit
              </span>
            </div>

            <h2 className="mt-10 text-3xl font-extrabold tracking-tight sm:text-4xl">
              Choose workspace & repository
            </h2>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-zinc-400">
              TypeScript and Next.js repos are listed first. Run the initial AST audit to open
              your Architecture Firewall dashboard.
            </p>
            <p className="mt-2 max-w-xl text-xs leading-relaxed text-zinc-500">
              Scans are read-only. Provix only writes or opens a pull request when you click{" "}
              <span className="text-zinc-300">Open Fix PR</span>.
            </p>

            <div className="mt-10 grid gap-3 sm:grid-cols-2">
              {(
                [
                  {
                    id: "solo" as const,
                    title: "Solo",
                    copy: "Personal workspace for one builder.",
                    icon: User,
                  },
                  {
                    id: "team" as const,
                    title: "Team",
                    copy: "Shared integrity view for collaborators.",
                    icon: Building2,
                  },
                ] as const
              ).map((option) => {
                const active = workspace === option.id;
                const Icon = option.icon;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => chooseWorkspace(option.id)}
                    className={`group relative rounded-2xl border bg-zinc-950/40 px-5 py-5 text-left transition-all duration-300 ${
                      active
                        ? "border-violet-400/50 shadow-[0_0_0_1px_rgba(167,139,250,0.35),0_0_40px_-8px_rgba(124,58,237,0.55)]"
                        : "border-white/10 hover:border-violet-400/40 hover:shadow-[0_0_0_1px_rgba(167,139,250,0.2),0_0_32px_-10px_rgba(124,58,237,0.4)]"
                    }`}
                  >
                    <Icon
                      className={`mb-3 h-5 w-5 ${active ? "text-violet-300" : "text-zinc-500 group-hover:text-violet-300"}`}
                      aria-hidden
                    />
                    <p className="text-base font-semibold tracking-tight text-zinc-50">
                      {option.title}
                    </p>
                    <p className="mt-1 text-sm text-zinc-500">{option.copy}</p>
                  </button>
                );
              })}
            </div>

            <div className="mt-10">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium text-zinc-300">
                <GitBranch className="h-4 w-4 text-zinc-500" aria-hidden />
                Repositories
              </div>
              {displayRepos.length === 0 ? (
                <p className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-zinc-500">
                  No repositories on this installation yet.{" "}
                  <button
                    type="button"
                    onClick={fallbackInstall}
                    className="text-violet-300 underline-offset-2 hover:underline"
                  >
                    Reconfigure GitHub access
                  </button>
                </p>
              ) : (
                <ul className="max-h-[320px] space-y-2 overflow-y-auto pr-1">
                  {displayRepos.map((repo) => {
                    const selected = selectedRepo === repo.fullName;
                    return (
                      <li key={repo.fullName}>
                        <button
                          type="button"
                          onClick={() => setSelectedRepo(repo.fullName)}
                          className={`flex w-full items-start justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-all duration-200 ${
                            selected
                              ? "border-emerald-400/40 bg-emerald-500/5 shadow-[0_0_24px_-10px_rgba(16,185,129,0.55)]"
                              : "border-white/8 bg-white/[0.02] hover:border-white/20"
                          }`}
                        >
                          <div>
                            <p className="font-mono text-sm text-zinc-100">{repo.fullName}</p>
                            <p className="mt-1 text-xs text-zinc-500">
                              {repo.language ?? "Unknown language"}
                              {repo.description ? ` · ${repo.description.slice(0, 72)}` : ""}
                            </p>
                          </div>
                          {repo.private ? (
                            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-500" aria-hidden />
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {error ? (
              <div className="mt-6 rounded-lg border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
                {error}
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => void runInitialAudit()}
              disabled={!selectedRepo || auditing}
              className="group mt-10 inline-flex w-full items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-violet-600 to-emerald-500 px-6 py-4 text-sm font-bold tracking-tight text-white shadow-[0_16px_50px_-20px_rgba(124,58,237,0.8)] transition-transform duration-200 hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
            >
              <Sparkles className="h-4 w-4" aria-hidden />
              {auditing ? "Running AST audit…" : "Run Initial AST Audit"}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
