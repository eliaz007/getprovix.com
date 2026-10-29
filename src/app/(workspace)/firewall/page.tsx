"use client";

import { useEffect, useState } from "react";
import FirewallScoreHeader from "@/components/firewall/firewall-score-header";
import FirewallViolationsTable from "@/components/firewall/firewall-violations-table";
import type { FirewallResponse } from "@/lib/firewall-contract";
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
  const { activeView, repoSlug, setActiveView, setRepoSlug } = useFirewallView();
  const [repoUrl, setRepoUrl] = useState("");
  const [entryNote, setEntryNote] = useState<string | null>(null);
  const [state, setState] = useState<PageState>({ kind: "idle" });
  const [isScanning, setIsScanning] = useState(false);
  const trimmedRepoUrl = repoUrl.trim();
  const showScanning = isScanning || state.kind === "scanning";

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

    let active = true;
    if (repo) {
      setRepoSlug(repo);
      setRepoUrl(`https://github.com/${repo}`);
    }
    setState({ kind: "scanning" });
    void (async () => {
      try {
        const response = await fetch("/api/firewall", { cache: "no-store" });
        const payload = await readJsonResponse<FirewallResponse>(response);
        if (!active) return;
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
        if (!active) return;
        setState({
          kind: "error",
          message: error instanceof Error ? error.message : "The architecture report could not be loaded.",
        });
      }
    })();

    return () => {
      active = false;
    };
    // Intentionally once on mount; repoSlug is seeded by FirewallViewProvider first.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

    const ownerRepo = `${parsed.owner}/${parsed.repo}`;
    setRepoUrl(parsed.repoUrl);
    setEntryNote(null);
    setIsScanning(true);
    setRepoSlug(ownerRepo);
    try {
      const response = await fetch("/api/firewall", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "github", repoUrl: ownerRepo }),
      });
      const payload = await readJsonResponse<FirewallResponse>(response);
      if (!response.ok || payload.status === "error" || !payload.report || payload.source !== "github") {
        setState({
          kind: "error",
          message: payload.message ?? "The GitHub repository could not be scanned.",
        });
        return;
      }
      const note = payload.message ?? `Scanned ${parsed.repoUrl}.`;
      const readyPayload: FirewallResponse = {
        ...payload,
        target: { kind: "github", repoUrl: ownerRepo },
      };
      saveFirewallScanHandoff({
        repoUrl: ownerRepo,
        report: payload.report,
        note,
        source: "github",
      });
      setRepoSlug(ownerRepo);
      setEntryNote(note);
      setState({ kind: "ready", payload: readyPayload });
      setActiveView("health");
    } catch (error) {
      setState({
        kind: "error",
        message: error instanceof Error ? error.message : "The GitHub repository could not be scanned.",
      });
    } finally {
      setIsScanning(false);
    }
  }

  const report = state.kind === "ready" ? state.payload.report : null;
  const scannedRepoUrl =
    repoSlug ||
    (state.kind === "ready" && state.payload.target?.kind === "github"
      ? sanitizeRepoParam(state.payload.target.repoUrl)
      : sanitizeRepoParam(trimmedRepoUrl)) ||
    null;

  return (
    <div className="space-y-5 text-zinc-100">
      {activeView === "firewall" ? (
        <>
          <header className="border-b border-neutral-800 pb-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-300">Architecture Firewall</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white md:text-3xl">Standalone code firewall</h1>
            <p className="mt-2 max-w-3xl text-sm text-zinc-400">
              {trimmedRepoUrl || "Boundary leaks, import cycles, bloat, and orphaned modules from the latest local snapshot."}
            </p>
            {entryNote ? <p className="mt-1.5 max-w-3xl text-sm text-zinc-500">{entryNote}</p> : null}
          </header>

          <form
            className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4"
            onSubmit={(event) => {
              event.preventDefault();
              void runAudit();
            }}
          >
            <label htmlFor="firewall-repo-url" className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
              Public repository
            </label>
            <div className="mt-2.5 flex flex-col gap-2.5 sm:flex-row">
              <input
                id="firewall-repo-url"
                type="text"
                inputMode="url"
                value={repoUrl}
                onChange={(event) => setRepoUrl(event.target.value)}
                placeholder="Paste public GitHub URL (e.g., https://github.com/owner/repo)..."
                disabled={showScanning}
                className="min-w-0 flex-1 rounded-lg border border-neutral-800 bg-neutral-950 px-3.5 py-2.5 font-mono text-sm text-white outline-none ring-violet-400/30 placeholder:text-zinc-600 focus:ring-2 disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={!trimmedRepoUrl || showScanning}
                className="shrink-0 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {showScanning ? "Scanning..." : "Run Audit"}
              </button>
            </div>
          </form>
        </>
      ) : null}

      {activeView === "health" ? (
        <header className="border-b border-neutral-800 pb-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-300">Repository health</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white md:text-3xl">Health metrics</h1>
          {entryNote ? <p className="mt-2 max-w-3xl text-sm text-zinc-500">{entryNote}</p> : null}
        </header>
      ) : null}

      {activeView === "violations" ? (
        <header className="border-b border-neutral-800 pb-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-300">Architecture log</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white md:text-3xl">Violation log</h1>
          {entryNote ? <p className="mt-2 max-w-3xl text-sm text-zinc-500">{entryNote}</p> : null}
        </header>
      ) : null}

      {showScanning ? (
        <p className="rounded-xl border border-neutral-800 bg-neutral-900/50 px-4 py-6 text-sm text-zinc-400" role="status">
          Scanning repository...
        </p>
      ) : null}

      {state.kind === "error" ? (
        <p className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-6 text-sm text-rose-100" role="alert">
          {state.message}
        </p>
      ) : null}

      {state.kind === "ready" && state.payload.status === "empty" ? (
        <p className="rounded-xl border border-amber-300/30 bg-amber-400/10 px-4 py-6 text-sm text-amber-50">
          {state.payload.message ?? "No architecture report is available yet."}
        </p>
      ) : null}

      {activeView === "health" && report ? (
        <FirewallScoreHeader
          report={report}
          title={state.kind === "ready" && state.payload.source === "github" ? "GitHub repository" : "Local codebase firewall"}
        />
      ) : null}
      {activeView === "violations" && report ? (
        <FirewallViolationsTable report={report} repoUrl={scannedRepoUrl} />
      ) : null}

      {activeView !== "firewall" && !report && !showScanning && state.kind !== "error" ? (
        <p className="rounded-xl border border-neutral-800 bg-neutral-900/50 px-4 py-6 text-sm text-zinc-400">
          Run an audit from Architecture Firewall to load this section.
        </p>
      ) : null}
    </div>
  );
}
