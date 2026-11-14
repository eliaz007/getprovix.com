"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import IntegrityPanel from "@/components/integrity-panel";
import FirewallViolationsTable from "@/components/firewall/firewall-violations-table";
import SecurityGuardPanel from "@/components/firewall/security-guard-panel";
import AuditsCommandCenter from "@/components/firewall/audits-command-center";
import { panelClass } from "@/components/firewall/firewall-ui";
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
import { partialScanLine } from "@/lib/firewall-repo-access";
import { withBrowserSession } from "@/lib/browser-auth-headers";
import { readJsonResponse } from "@/lib/read-json-response";
import { useFirewallView } from "@/components/firewall/firewall-view-context";

type PageState =
  | { kind: "idle" }
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
  const { activeView, repoSlug, setRepoSlug, setSecurityCount, setActiveView } = useFirewallView();
  const installation = useGithubAppInstallation();
  const [repoUrl, setRepoUrl] = useState("");
  const [entryNote, setEntryNote] = useState<string | null>(null);
  const [state, setState] = useState<PageState>({ kind: "idle" });
  const [isScanning, setIsScanning] = useState(false);
  const installationBootstrapped = useRef(false);
  // Bumps on every new audit so stale in-flight responses cannot keep the UI scanning.
  const scanGenRef = useRef(0);
  const trimmedRepoUrl = repoUrl.trim();
  const coverageLine = state.kind === "ready" ? partialScanLine(state.payload.coverage) : null;

  async function loadGithubAudit(ownerRepo: string, opts?: { switchToAudits?: boolean }) {
    const clean = sanitizeRepoParam(ownerRepo);
    if (!clean) return;
    const gen = ++scanGenRef.current;
    // Immediate feedback: leave Overview inputs behind and show animated scan state.
    if (opts?.switchToAudits !== false) {
      setActiveView("audits");
    }
    setRepoUrl(`https://github.com/${clean}`);
    setEntryNote(null);
    setIsScanning(true);
    setRepoSlug(clean);
    try {
      const response = await fetch("/api/firewall", {
        method: "POST",
        headers: await withBrowserSession({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({ source: "github", repoUrl: clean }),
      });
      if (gen !== scanGenRef.current) return;
      const payload = await readJsonResponse<FirewallResponse>(response);
      if (gen !== scanGenRef.current) return;
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
        coverage: payload.coverage ?? null,
      });
      setRepoSlug(clean);
      setEntryNote(note);
      setState({ kind: "ready", payload: readyPayload });
    } catch (error) {
      if (gen !== scanGenRef.current) return;
      if (error instanceof DOMException && error.name === "AbortError") return;
      setState({
        kind: "error",
        message: error instanceof Error ? error.message : "The GitHub repository could not be scanned.",
      });
    } finally {
      if (gen === scanGenRef.current) setIsScanning(false);
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
          coverage: handoff.coverage ?? null,
        },
      });
      return;
    }

    // Prefer a generation bump over AbortController.abort(): Next.js dev overlays
    // surface `AbortError: signal is aborted without reason` from cleanup aborts
    // (especially under Strict Mode remount), even when the rejection is caught.
    const gen = ++scanGenRef.current;
    if (repo) {
      setRepoSlug(repo);
      setRepoUrl(`https://github.com/${repo}`);
    }
    setIsScanning(true);
    setActiveView("audits");
    void (async () => {
      try {
        const response = await fetch("/api/firewall", {
          cache: "no-store",
        });
        if (gen !== scanGenRef.current) return;
        const payload = await readJsonResponse<FirewallResponse>(response);
        if (gen !== scanGenRef.current) return;
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
        if (gen !== scanGenRef.current) return;
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState({
          kind: "error",
          message: error instanceof Error ? error.message : "The architecture report could not be loaded.",
        });
      } finally {
        if (gen === scanGenRef.current) setIsScanning(false);
      }
    })();

    return () => {
      // Invalidate this mount's fetch without aborting (avoids Next.js AbortError overlay).
      if (scanGenRef.current === gen) {
        scanGenRef.current += 1;
        setIsScanning(false);
      }
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

    void loadGithubAudit(repo, { switchToAudits: true });
    // Do not reset installationBootstrapped on cleanup — that re-fired audits in a loop
    // whenever installation deps changed (and under Strict Mode remount).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [installation.loading, installation.installed, installation.primaryRepo]);

  async function runAudit() {
    if (!trimmedRepoUrl || isScanning) return;
    // Flip scanning UI immediately so the button never feels dead.
    setIsScanning(true);
    setActiveView("audits");
    setState((prev) => (prev.kind === "error" ? { kind: "idle" } : prev));
    const parsed = parseGitHubRepository(trimmedRepoUrl);
    if (!parsed) {
      setEntryNote(null);
      setIsScanning(false);
      setState({
        kind: "error",
        message: "Paste a public GitHub URL or owner/repo.",
      });
      return;
    }
    await loadGithubAudit(`${parsed.owner}/${parsed.repo}`, { switchToAudits: true });
  }

  const report = state.kind === "ready" ? state.payload.report : null;
  const scannedRepoUrl =
    repoSlug ||
    (state.kind === "ready" && state.payload.target?.kind === "github"
      ? sanitizeRepoParam(state.payload.target.repoUrl)
      : sanitizeRepoParam(trimmedRepoUrl)) ||
    null;
  const onOverview = activeView === "health" || activeView === "firewall";
  const onAudits = activeView === "audits";
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
    return Array.from(new Set(merged)).slice(0, 8);
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
      {onAudits ? (
        <AuditsCommandCenter
          repoUrl={repoUrl}
          onRepoUrlChange={setRepoUrl}
          recentRepos={recentRepos}
          scannedRepoUrl={scannedRepoUrl}
          isScanning={isScanning}
          errorMessage={state.kind === "error" ? state.message : null}
          entryNote={entryNote}
          coverage={state.kind === "ready" ? state.payload.coverage : null}
          report={report}
          onRunAudit={() => void runAudit()}
          onSelectRepo={(repo) => void loadGithubAudit(repo, { switchToAudits: true })}
        />
      ) : null}

      {onOverview ? (
        <>
          <header className="flex items-center justify-between gap-4 border-b border-zinc-800/60 pb-5">
            <div className="min-w-0 flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <h1 className="truncate text-xl font-medium tracking-tight text-zinc-50 sm:text-2xl">
                {report ? (scannedRepoUrl ?? "Overview") : "Overview"}
              </h1>
              {scannedRepoUrl ? (
                <span className="inline-flex items-center rounded-md border border-zinc-700/50 bg-zinc-900/40 px-2 py-0.5 font-mono text-[11px] font-medium text-zinc-400">
                  main
                </span>
              ) : null}
              {report ? (
                <p className="font-mono text-xs tabular-nums text-zinc-500">
                  <span className="text-zinc-300">
                    {report.violations.filter((v) => v.severity === "CRITICAL").length}
                  </span>{" "}
                  critical ·{" "}
                  <span className="text-zinc-300">
                    {report.violations.filter((v) => v.severity === "HIGH").length}
                  </span>{" "}
                  high ·{" "}
                  <span className="text-zinc-300">
                    {
                      report.violations.filter(
                        (v) => v.severity !== "CRITICAL" && v.severity !== "HIGH"
                      ).length
                    }
                  </span>{" "}
                  other
                </p>
              ) : (
                <p className="text-sm text-zinc-500">High-level score and activity for your latest scan.</p>
              )}
              {coverageLine ? <p className="w-full text-sm text-amber-200/90 sm:w-auto">{coverageLine}</p> : null}
            </div>
            <button
              type="button"
              onClick={() => (trimmedRepoUrl ? void runAudit() : setActiveView("audits"))}
              disabled={isScanning}
              className="shrink-0 rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-950 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isScanning ? "Scanning…" : "Run Audit"}
            </button>
          </header>

          {!report && !isScanning ? (
            <section className={`${panelClass} px-5 py-8 text-center sm:px-8`}>
              <p className="text-sm text-zinc-400">No scan loaded yet.</p>
              <button
                type="button"
                onClick={() => setActiveView("audits")}
                className="mt-4 rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-950 transition-colors hover:bg-white"
              >
                Open Audits
              </button>
            </section>
          ) : null}

          {isScanning && onOverview ? (
            <p
              className="rounded-xl border border-zinc-800/80 bg-gradient-to-b from-zinc-900/60 to-zinc-950/90 px-5 py-6 text-sm text-zinc-500 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]"
              role="status"
            >
              Scan in progress — see Audits for live status.
            </p>
          ) : null}

          {report ? (
            <IntegrityPanel
              repo={scannedRepoUrl}
              report={report}
              coverage={state.kind === "ready" ? state.payload.coverage : null}
            />
          ) : null}
        </>
      ) : null}

      {activeView === "violations" ? (
        <header className="flex flex-col gap-2 border-b border-zinc-800/60 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 space-y-1">
            <p className="text-xs text-zinc-500">Architecture</p>
            <h1 className="text-xl font-medium tracking-tight text-zinc-50 sm:text-2xl">Structure</h1>
            {entryNote ? <p className="max-w-3xl text-sm text-zinc-600">{entryNote}</p> : null}
            {coverageLine ? <p className="max-w-3xl text-sm text-amber-200/90">{coverageLine}</p> : null}
          </div>
        </header>
      ) : null}

      {activeView === "leaks" ? (
        <header className="flex flex-col gap-2 border-b border-zinc-800/60 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 space-y-1">
            <p className="text-xs text-zinc-500">Security</p>
            <h1 className="text-xl font-medium tracking-tight text-zinc-50 sm:text-2xl">Security</h1>
            {entryNote ? <p className="max-w-3xl text-sm text-zinc-600">{entryNote}</p> : null}
            {coverageLine ? <p className="max-w-3xl text-sm text-amber-200/90">{coverageLine}</p> : null}
          </div>
        </header>
      ) : null}

      {state.kind === "error" && !onAudits ? (
        <p
          className="rounded-xl border border-zinc-800/80 bg-gradient-to-b from-zinc-900/60 to-zinc-950/90 px-5 py-6 text-sm text-zinc-300 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]"
          role="alert"
        >
          {state.message}
        </p>
      ) : null}

      {state.kind === "ready" && state.payload.status === "empty" && !onAudits ? (
        <p className="rounded-xl border border-zinc-800/80 bg-gradient-to-b from-zinc-900/60 to-zinc-950/90 px-5 py-6 text-sm text-zinc-500 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]">
          {state.payload.message ?? "No architecture report is available yet."}
        </p>
      ) : null}

      {activeView === "violations" && report ? (
        <FirewallViolationsTable report={report} repoUrl={scannedRepoUrl} />
      ) : null}
      {activeView === "leaks" && report ? <SecurityGuardPanel report={report} /> : null}

      {(activeView === "violations" || activeView === "leaks") &&
      !report &&
      !isScanning &&
      state.kind !== "error" ? (
        <section className={`${panelClass} px-5 py-8 text-center`}>
          <p className="text-sm text-zinc-500">Run an audit to load this section.</p>
          <button
            type="button"
            onClick={() => setActiveView("audits")}
            className="mt-4 rounded-lg border border-white/[0.10] bg-white/[0.04] px-4 py-2 text-sm font-medium text-zinc-100 transition-colors hover:bg-white/[0.08]"
          >
            Open Audits
          </button>
        </section>
      ) : null}
    </div>
  );
}
