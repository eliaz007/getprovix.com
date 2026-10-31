"use client";

import { useEffect, useRef, useState } from "react";
import IntegrityPanel from "@/components/integrity-panel";
import FirewallViolationsTable from "@/components/firewall/firewall-violations-table";
import SecurityGuardPanel from "@/components/firewall/security-guard-panel";
import { useGithubAppInstallation } from "@/components/onboarding/use-github-app-installation";
import type { FirewallResponse } from "@/lib/firewall-contract";
import { isSecurityCategory } from "@/lib/firewall-contract";
import { parseGitHubRepository, toGitHubOwnerRepo } from "@/lib/github-repo-ref";
import {
  readFirewallScanHandoff,
  readLatestFirewallScanHandoff,
  saveFirewallScanHandoff,
} from "@/lib/firewall-scan-handoff";
import { readJsonResponse } from "@/lib/read-json-response";
import { useFirewallView } from "@/components/firewall/firewall-view-context";

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
  const { activeView, repoSlug, setActiveView, setRepoSlug, setIntegrityPane, setSecurityCount } = useFirewallView();
  const installation = useGithubAppInstallation();
  const [repoUrl, setRepoUrl] = useState("");
  const [entryNote, setEntryNote] = useState<string | null>(null);
  const [state, setState] = useState<PageState>({ kind: "idle" });
  const [isScanning, setIsScanning] = useState(false);
  const installationBootstrapped = useRef(false);
  const trimmedRepoUrl = repoUrl.trim();
  const showScanning = isScanning || state.kind === "scanning";

  async function loadGithubAudit(ownerRepo: string, openIntegrity = true, signal?: AbortSignal) {
    const clean = sanitizeRepoParam(ownerRepo);
    if (!clean) return;
    setRepoUrl(`https://github.com/${clean}`);
    setEntryNote(null);
    setIsScanning(true);
    setRepoSlug(clean);
    if (openIntegrity) {
      setActiveView("health");
      setIntegrityPane("integrity");
    }
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
      if (openIntegrity) {
        setActiveView("health");
        setIntegrityPane("integrity");
      }
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
    const urlView = params.get("view");
    const primary = installation.primaryRepo ? sanitizeRepoParam(installation.primaryRepo) : "";
    const repo = urlRepo || primary;
    installationBootstrapped.current = true;
    if (!repo) return;

    setRepoSlug(repo);
    setRepoUrl(`https://github.com/${repo}`);
    if (!urlView || urlView === "firewall") {
      setActiveView("health");
      setIntegrityPane("integrity");
    }

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
    void loadGithubAudit(
      repo,
      !urlView || urlView === "firewall" || urlView === "health",
      controller.signal
    );
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
    await loadGithubAudit(`${parsed.owner}/${parsed.repo}`, true);
  }

  const report = state.kind === "ready" ? state.payload.report : null;
  const scannedRepoUrl =
    repoSlug ||
    (state.kind === "ready" && state.payload.target?.kind === "github"
      ? sanitizeRepoParam(state.payload.target.repoUrl)
      : sanitizeRepoParam(trimmedRepoUrl)) ||
    null;

  useEffect(() => {
    if (!report) {
      setSecurityCount(null);
      return;
    }
    setSecurityCount(report.violations.filter((violation) => isSecurityCategory(violation.category)).length);
  }, [report, setSecurityCount]);

  return (
    <div className="space-y-4 text-zinc-100">
      {activeView === "firewall" ? (
        <>
          <header className="space-y-1 pb-1">
            <p className="text-xs text-zinc-500">Architecture Firewall</p>
            <h1 className="text-2xl font-medium tracking-tight text-zinc-50">Code firewall</h1>
            <p className="max-w-3xl text-sm leading-relaxed text-zinc-500">
              {trimmedRepoUrl ||
                "Boundary leaks, import cycles, bloat, and orphaned modules from the latest local snapshot."}
            </p>
            {entryNote ? <p className="max-w-3xl text-sm text-zinc-600">{entryNote}</p> : null}
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
                {showScanning ? "Scanning…" : "Run audit"}
              </button>
            </div>
          </form>
        </>
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

      {activeView === "health" ? <IntegrityPanel repo={scannedRepoUrl} report={report} /> : null}
      {activeView === "violations" && report ? (
        <FirewallViolationsTable report={report} repoUrl={scannedRepoUrl} />
      ) : null}
      {activeView === "leaks" && report ? <SecurityGuardPanel report={report} /> : null}

      {activeView !== "firewall" && activeView !== "health" && !report && !showScanning && state.kind !== "error" ? (
        <p className="rounded-xl border border-white/[0.06] bg-[#0A0A0B] px-5 py-6 text-sm text-zinc-500">
          Run an audit from Architecture Firewall to load this section.
        </p>
      ) : null}
    </div>
  );
}
