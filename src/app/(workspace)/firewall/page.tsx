"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import IntegrityPanel from "@/components/integrity-panel";
import FirewallViolationsTable from "@/components/firewall/firewall-violations-table";
import SecurityGuardPanel from "@/components/firewall/security-guard-panel";
import {
  mutedLabelClass,
  panelClass,
  sectionLabelClass,
} from "@/components/firewall/firewall-ui";
import { useGithubAppInstallation } from "@/components/onboarding/use-github-app-installation";
import type { FirewallResponse } from "@/lib/firewall-contract";
import { isSecurityCategory } from "@/lib/firewall-contract";
import { isActionableSecurityFinding } from "@/lib/firewall-autofix";
import { parseGitHubRepository, toGitHubOwnerRepo } from "@/lib/github-repo-ref";
import {
  readFirewallScanHandoff,
  readLatestFirewallScanHandoff,
  saveFirewallScanHandoff,
} from "@/lib/firewall-scan-handoff";
import { readJsonResponse } from "@/lib/read-json-response";
import { useFirewallView } from "@/components/firewall/firewall-view-context";

const QUICK_START = [
  {
    title: "AST Boundary Enforcement",
    body: "Detect import cycles, layer leaks, and orphaned modules before they ship.",
  },
  {
    title: "Secret & Leak Interception",
    body: "Catch credentials, client DB exposure, and vulnerable dependencies in-scan.",
  },
  {
    title: "Automated Fix PRs",
    body: "Open type-safe remediation pull requests with one click from each finding.",
  },
] as const;

type PageState =
  | { kind: "idle" }
  | { kind: "scanning" }
  | { kind: "ready"; payload: FirewallResponse }
  | { kind: "error"; message: string };

const LOCAL_SNAPSHOT_NOTE =
  "Remote GitHub scans are not running yet. This is the latest firewall snapshot on this workspace.";

function sanitizeRepoParam(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  return toGitHubOwnerRepo(trimmed) ?? "";
}

export default function FirewallPage() {
  const { activeView, repoSlug, setRepoSlug, setSecurityCount } = useFirewallView();
  const installation = useGithubAppInstallation();
  const [repoUrl, setRepoUrl] = useState("");
  const [entryNote, setEntryNote] = useState<string | null>(null);
  const [state, setState] = useState<PageState>({ kind: "idle" });
  const [isScanning, setIsScanning] = useState(false);
  const installationBootstrapped = useRef(false);
  const trimmedRepoUrl = repoUrl.trim();
  const showScanning = isScanning || state.kind === "scanning";

  async function loadGithubAudit(ownerRepo: string, signal?: AbortSignal) {
    const clean = sanitizeRepoParam(ownerRepo);
    if (!clean) return;
    setRepoUrl(`https://github.com/${clean}`);
    setEntryNote(null);
    setIsScanning(true);
    setRepoSlug(clean);
    try {
      const response = await fetch("/api/firewall", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "github", repoUrl: clean }),
        signal,
      });
      if (signal?.aborted) return;
      const payload = await readJsonResponse<FirewallResponse>(response);
      if (signal?.aborted) return;
      if (!response.ok || payload.status === "error" || !payload.report || payload.source !== "github") {
        setState({
          kind: "error",
          message: payload.message ?? "The GitHub repository could not be scanned.",
        });
        return;
      }
      const note = payload.message ?? `Scanned https://github.com/${clean}.`;
      const readyPayload: FirewallResponse = {
        ...payload,
        target: { kind: "github", repoUrl: clean },
      };
      saveFirewallScanHandoff({
        repoUrl: clean,
        report: payload.report,
        note,
        source: "github",
      });
      setRepoSlug(clean);
      setEntryNote(note);
      setState({ kind: "ready", payload: readyPayload });
    } catch (error) {
      if (signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) {
        return;
      }
      setState({
        kind: "error",
        message: error instanceof Error ? error.message : "The GitHub repository could not be scanned.",
      });
    } finally {
      if (!signal?.aborted) setIsScanning(false);
    }
  }

  useEffect(() => {
    const repo = repoSlug ?? sanitizeRepoParam(new URLSearchParams(window.location.search).get("repo") ?? "");
    const handoff = repo ? readFirewallScanHandoff(repo) : readLatestFirewallScanHandoff();
    if (!repo && !handoff) return;
    if (handoff) {
      const ownerRepo = sanitizeRepoParam(handoff.repoUrl) || repo;
      if (ownerRepo) setRepoSlug(ownerRepo);
      setRepoUrl(ownerRepo ? `https://github.com/${ownerRepo}` : handoff.repoUrl);
      setEntryNote(handoff.note);
      setState({
        kind: "ready",
        payload: {
          ok: true,
          source: handoff.source === "github" ? "github" : "local",
          status: "ready",
          message: handoff.note,
          target: { kind: "github", repoUrl: ownerRepo || handoff.repoUrl },
          report: handoff.report,
        },
      });
      return;
    }

    const controller = new AbortController();
    if (repo) {
      setRepoSlug(repo);
      setRepoUrl(`https://github.com/${repo}`);
    }
    setState({ kind: "scanning" });
    void (async () => {
      try {
        const response = await fetch("/api/firewall", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        const payload = await readJsonResponse<FirewallResponse>(response);
        if (controller.signal.aborted) return;
        if (!response.ok || payload.status === "error" || !payload.report) {
          setState({
            kind: "error",
            message: payload.message ?? "The architecture report could not be loaded.",
          });
          return;
        }
        setEntryNote(LOCAL_SNAPSHOT_NOTE);
        setState({ kind: "ready", payload });
      } catch (error) {
        if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) {
          return;
        }
        setState({
          kind: "error",
          message: error instanceof Error ? error.message : "The architecture report could not be loaded.",
        });
      }
    })();

    return () => {
      controller.abort();
    };
    // Intentionally once on mount; repoSlug is seeded by FirewallViewProvider first.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When an App installation already exists, skip Connect and open the audit view.
  useEffect(() => {
    if (installationBootstrapped.current || installation.loading || !installation.installed) return;
    const params = new URLSearchParams(window.location.search);
    const urlRepo = sanitizeRepoParam(params.get("repo") ?? "");
    const primary = installation.primaryRepo ? sanitizeRepoParam(installation.primaryRepo) : "";
    const repo = urlRepo || primary;
    installationBootstrapped.current = true;
    if (!repo) return;

    setRepoSlug(repo);
    setRepoUrl(`https://github.com/${repo}`);

    const handoff = readFirewallScanHandoff(repo);
    if (handoff && sanitizeRepoParam(handoff.repoUrl) === repo) {
      setEntryNote(handoff.note);
      setState({
        kind: "ready",
        payload: {
          ok: true,
          source: handoff.source === "github" ? "github" : "local",
          status: "ready",
          message: handoff.note,
          target: { kind: "github", repoUrl: repo },
          report: handoff.report,
        },
      });
      return;
    }

    const controller = new AbortController();
    void loadGithubAudit(repo, controller.signal);
    return () => {
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [installation.loading, installation.installed, installation.primaryRepo]);

  async function runAudit() {
    if (!trimmedRepoUrl || isScanning) return;
    const parsed = parseGitHubRepository(trimmedRepoUrl);
    if (!parsed) {
      setEntryNote(null);
      setState({
        kind: "error",
        message: "Paste a public GitHub URL or owner/repo.",
      });
      return;
    }
    await loadGithubAudit(`${parsed.owner}/${parsed.repo}`);
  }

  const report = state.kind === "ready" ? state.payload.report : null;
  const scannedRepoUrl =
    repoSlug ||
    (state.kind === "ready" && state.payload.target?.kind === "github"
      ? sanitizeRepoParam(state.payload.target.repoUrl)
      : sanitizeRepoParam(trimmedRepoUrl)) ||
    null;
  const onIntegrity = activeView === "health" || activeView === "firewall";
  const showOnboarding = onIntegrity && !report && !showScanning && state.kind !== "error";
  const showRepoDashboard = onIntegrity && !showOnboarding;
  const typedRepo = sanitizeRepoParam(trimmedRepoUrl);
  const rerunCurrent = Boolean(scannedRepoUrl) && typedRepo === scannedRepoUrl;
  const [handoffRepo, setHandoffRepo] = useState<string | null>(null);
  useEffect(() => {
    const handoff = readLatestFirewallScanHandoff();
    const slug = handoff ? sanitizeRepoParam(handoff.repoUrl) : "";
    setHandoffRepo(slug || null);
  }, []);
  const recentRepos = useMemo(() => {
    const fromInstall = installation.repositories
      .map((repo) => sanitizeRepoParam(repo))
      .filter(Boolean);
    const merged = handoffRepo ? [handoffRepo, ...fromInstall] : fromInstall;
    return Array.from(new Set(merged)).slice(0, 6);
  }, [handoffRepo, installation.repositories]);

  useEffect(() => {
    if (!report) {
      setSecurityCount(null);
      return;
    }
    setSecurityCount(
      report.violations.filter(
        (violation) => isSecurityCategory(violation.category) && isActionableSecurityFinding(violation)
      ).length
    );
  }, [report, setSecurityCount]);

  return (
    <div className="space-y-4 text-zinc-100">
      {showOnboarding ? (
        <>
          <header className="space-y-1 pb-1">
            <p className="text-xs text-zinc-500">Integrity</p>
            <h1 className="text-2xl font-medium tracking-tight text-zinc-50">Code firewall</h1>
            <p className="max-w-3xl text-sm leading-relaxed text-zinc-500">
              Paste a repository to open the execution stream and integrity dashboard.
            </p>
          </header>

          <form
            className="rounded-xl border border-white/[0.06] bg-[#0A0A0B] px-4 py-4 sm:px-5"
            onSubmit={(event) => {
              event.preventDefault();
              void runAudit();
            }}
          >
            <label htmlFor="firewall-repo-url" className="text-xs text-zinc-500">
              Public repository
            </label>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <input
                id="firewall-repo-url"
                type="text"
                inputMode="url"
                value={repoUrl}
                onChange={(event) => setRepoUrl(event.target.value)}
                placeholder="https://github.com/owner/repo"
                disabled={showScanning}
                className="min-w-0 flex-1 rounded-lg border border-white/[0.08] bg-black/40 px-3 py-2 font-mono text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-white/20 disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={!trimmedRepoUrl || showScanning}
                className="shrink-0 rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-950 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                Run audit
              </button>
            </div>
          </form>

          <div className="space-y-4">
            <section className={panelClass}>
              <div className="border-b border-white/[0.06] px-5 py-4">
                <h2 className={sectionLabelClass}>Quick start · What Provix audits</h2>
                <p className={`mt-1 ${mutedLabelClass}`}>
                  Paste a repo above, or pick a connected repository to open the control plane.
                </p>
              </div>
              <div className="grid gap-px bg-white/[0.06] sm:grid-cols-3">
                {QUICK_START.map((item) => (
                  <article key={item.title} className="bg-[#0A0A0B] px-5 py-5">
                    <h3 className="text-sm font-medium tracking-tight text-zinc-100">{item.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-zinc-500">{item.body}</p>
                  </article>
                ))}
              </div>
            </section>

            {recentRepos.length > 0 ? (
              <section className={panelClass}>
                <div className="border-b border-white/[0.06] px-5 py-4">
                  <h2 className={sectionLabelClass}>Recent connected repositories</h2>
                  <p className={`mt-1 ${mutedLabelClass}`}>One click to run an audit</p>
                </div>
                <ul>
                  {recentRepos.map((repo) => (
                    <li key={repo} className="border-t border-white/[0.04] first:border-t-0">
                      <button
                        type="button"
                        disabled={showScanning}
                        onClick={() => void loadGithubAudit(repo)}
                        className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left transition-colors hover:bg-white/[0.02] disabled:opacity-60"
                      >
                        <span className="truncate font-mono text-sm text-zinc-200">{repo}</span>
                        <span className="shrink-0 text-xs text-zinc-500">Run audit</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        </>
      ) : null}

      {showRepoDashboard ? (
        <header className="flex flex-col gap-4 pb-1 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 space-y-1">
            <p className="text-xs text-zinc-500">Integrity</p>
            <h1 className="truncate text-2xl font-medium tracking-tight text-zinc-50">
              {scannedRepoUrl ?? "Code firewall"}
            </h1>
            {entryNote ? <p className="max-w-xl text-sm text-zinc-600">{entryNote}</p> : null}
          </div>
          <form
            className="flex w-full flex-col gap-2 sm:max-w-xl sm:flex-row sm:items-center lg:justify-end"
            onSubmit={(event) => {
              event.preventDefault();
              void runAudit();
            }}
          >
            {recentRepos.length > 0 ? (
              <select
                aria-label="Switch repository"
                value={recentRepos.includes(scannedRepoUrl ?? "") ? scannedRepoUrl ?? "" : ""}
                disabled={showScanning}
                onChange={(event) => {
                  const next = event.target.value;
                  if (next) void loadGithubAudit(next);
                }}
                className="rounded-lg border border-white/[0.08] bg-black/40 px-2.5 py-2 font-mono text-xs text-zinc-200 outline-none focus:border-white/20 disabled:opacity-60"
              >
                <option value="">Switch repo</option>
                {recentRepos.map((repo) => (
                  <option key={repo} value={repo}>
                    {repo}
                  </option>
                ))}
              </select>
            ) : null}
            <input
              aria-label="Switch / scan repo"
              type="text"
              inputMode="url"
              value={repoUrl}
              onChange={(event) => setRepoUrl(event.target.value)}
              placeholder="owner/repo"
              disabled={showScanning}
              className="min-w-0 flex-1 rounded-lg border border-white/[0.08] bg-black/40 px-3 py-2 font-mono text-xs text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-white/20 disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={!trimmedRepoUrl || showScanning}
              className="shrink-0 rounded-lg border border-white/[0.10] bg-white/[0.04] px-3 py-2 text-xs font-medium text-zinc-100 transition-colors hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {showScanning ? "Scanning…" : rerunCurrent ? "Re-run audit" : "Scan repo"}
            </button>
          </form>
        </header>
      ) : null}

      {activeView === "violations" ? (
        <header className="space-y-1 pb-1">
          <p className="text-xs text-zinc-500">Architecture</p>
          <h1 className="text-2xl font-medium tracking-tight text-zinc-50">Violations</h1>
          {entryNote ? <p className="max-w-3xl text-sm text-zinc-600">{entryNote}</p> : null}
        </header>
      ) : null}

      {activeView === "leaks" ? (
        <header className="space-y-1 pb-1">
          <p className="text-xs text-zinc-500">Security</p>
          <h1 className="text-2xl font-medium tracking-tight text-zinc-50">Leaks</h1>
          {entryNote ? <p className="max-w-3xl text-sm text-zinc-600">{entryNote}</p> : null}
        </header>
      ) : null}

      {showRepoDashboard && !report && !showScanning && state.kind !== "error" ? (
        <p className="rounded-xl border border-white/[0.06] bg-[#0A0A0B] px-5 py-6 text-sm text-zinc-500">
          Run an audit to load the execution stream.
        </p>
      ) : null}

      {showScanning ? (
        <p
          className="rounded-xl border border-white/[0.06] bg-[#0A0A0B] px-5 py-6 text-sm text-zinc-500"
          role="status"
        >
          Scanning repository…
        </p>
      ) : null}

      {state.kind === "error" ? (
        <p
          className="rounded-xl border border-white/[0.06] bg-[#0A0A0B] px-5 py-6 text-sm text-zinc-300"
          role="alert"
        >
          {state.message}
        </p>
      ) : null}

      {state.kind === "ready" && state.payload.status === "empty" ? (
        <p className="rounded-xl border border-white/[0.06] bg-[#0A0A0B] px-5 py-6 text-sm text-zinc-500">
          {state.payload.message ?? "No architecture report is available yet."}
        </p>
      ) : null}

      {showRepoDashboard && report ? <IntegrityPanel repo={scannedRepoUrl} report={report} /> : null}
      {activeView === "violations" && report ? (
        <FirewallViolationsTable report={report} repoUrl={scannedRepoUrl} />
      ) : null}
      {activeView === "leaks" && report ? <SecurityGuardPanel report={report} /> : null}

      {!onIntegrity && !report && !showScanning && state.kind !== "error" ? (
        <p className="rounded-xl border border-white/[0.06] bg-[#0A0A0B] px-5 py-6 text-sm text-zinc-500">
          Run an audit from Integrity to load this section.
        </p>
      ) : null}
    </div>
  );
}
