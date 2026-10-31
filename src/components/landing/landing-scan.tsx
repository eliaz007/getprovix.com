"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { FirewallReport, FirewallResponse } from "@/lib/firewall-contract";
import { saveFirewallScanHandoff } from "@/lib/firewall-scan-handoff";
import { toGitHubOwnerRepo } from "@/lib/github-repo-ref";
import { readJsonResponse } from "@/lib/read-json-response";

const STEPS = [
  "Cloning repository safely...",
  "Parsing abstract syntax trees...",
  "Checking for circular dependencies & monolithic bloat...",
  "Generating firewall snapshot...",
] as const;

const STEP_MS = 1100;

type ScanState =
  | { kind: "idle" }
  | { kind: "scanning"; repoUrl: string; step: number; opening: boolean }
  | { kind: "error"; message: string };

type LoadedScan =
  | { ok: true; report: FirewallReport; note: string }
  | { ok: false; message: string };

function parseGitHubRepo(value: string): string | null {
  try {
    const url = new URL(value.trim());
    const host = url.hostname.toLowerCase();
    if (host !== "github.com" && host !== "www.github.com") return null;
    const [owner, repo] = url.pathname.split("/").filter(Boolean);
    if (!owner || !repo) return null;
    const cleanRepo = repo.replace(/\.git$/, "");
    if (!/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(cleanRepo)) return null;
    return `https://github.com/${owner}/${cleanRepo}`;
  } catch {
    return null;
  }
}

function delay(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function loadScan(repoUrl: string): Promise<LoadedScan> {
  const posted = await fetch("/api/firewall", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source: "github", repoUrl }),
  });
  const payload = await readJsonResponse<FirewallResponse>(posted);
  if (payload.status === "ready" && payload.report && payload.source === "github") {
    return { ok: true, report: payload.report, note: payload.message ?? `Scanned ${repoUrl}.` };
  }

  return { ok: false, message: payload.message ?? "The GitHub repository could not be scanned." };
}

export default function LandingScan() {
  const router = useRouter();
  const [repoUrl, setRepoUrl] = useState("");
  const [state, setState] = useState<ScanState>({ kind: "idle" });
  const [revealed, setRevealed] = useState(false);
  const runId = useRef(0);

  useEffect(() => () => {
    runId.current += 1;
  }, []);

  useEffect(() => {
    if (state.kind !== "scanning") {
      setRevealed(false);
      return;
    }
    const frame = window.requestAnimationFrame(() => setRevealed(true));
    return () => window.cancelAnimationFrame(frame);
  }, [state.kind]);

  async function scanRepository(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state.kind === "scanning") return;
    const normalized = parseGitHubRepo(repoUrl);
    if (!normalized) {
      setState({
        kind: "error",
        message: "Paste a public GitHub URL like https://github.com/owner/repo.",
      });
      return;
    }

    const id = ++runId.current;
    const still = () => runId.current === id;
    setState({ kind: "scanning", repoUrl: normalized, step: 0, opening: false });

    const settlement: { result: LoadedScan | null } = { result: null };
    const pending = loadScan(normalized).then(
      (result) => {
        settlement.result = result;
        return result;
      },
      (error: unknown) => {
        const result: LoadedScan = {
          ok: false,
          message: error instanceof Error ? error.message : "The scan could not be completed.",
        };
        settlement.result = result;
        return result;
      }
    );

    for (let step = 0; step < STEPS.length; step += 1) {
      if (!still()) return;
      setState({ kind: "scanning", repoUrl: normalized, step, opening: false });
      await delay(STEP_MS);
      if (!still()) return;
      const early = settlement.result;
      if (early && !early.ok) {
        setState({ kind: "error", message: early.message });
        return;
      }
    }

    const result: LoadedScan = settlement.result ?? (await pending);
    if (!still()) return;
    if (!result.ok) {
      setState({ kind: "error", message: result.message });
      return;
    }

    const repoSlug = toGitHubOwnerRepo(normalized) ?? normalized;
    saveFirewallScanHandoff({ repoUrl: repoSlug, report: result.report, note: result.note, source: "github" });
    setState({ kind: "scanning", repoUrl: normalized, step: STEPS.length - 1, opening: true });
    await delay(450);
    if (!still()) return;
    const params = new URLSearchParams();
    params.set("repo", repoSlug);
    params.set("view", "health");
    router.push(`/firewall?${params.toString()}`);
  }

  const scanning = state.kind === "scanning";
  const progress = !scanning ? 0 : state.opening ? 100 : Math.round(((state.step + 0.4) / STEPS.length) * 100);

  return (
    <div className="w-full text-left">
      <form
        onSubmit={(event) => void scanRepository(event)}
        className="flex flex-col gap-2 rounded-xl border border-white/[0.08] bg-black/40 p-1.5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06),0_0_40px_-16px_rgba(59,130,246,0.55)] transition-shadow focus-within:border-[#3b82f6]/40 focus-within:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06),0_0_36px_-10px_rgba(59,130,246,0.75)] sm:flex-row"
      >
        <label htmlFor="landing-repo-url" className="sr-only">
          Public GitHub URL
        </label>
        <input
          id="landing-repo-url"
          type="url"
          inputMode="url"
          value={repoUrl}
          onChange={(event) => setRepoUrl(event.target.value)}
          placeholder="https://github.com/owner/repo"
          disabled={scanning}
          className="min-w-0 flex-1 bg-transparent px-3 py-2.5 font-mono text-[13px] text-[#f9fafb] outline-none placeholder:text-[#f9fafb]/35"
        />
        <button
          type="submit"
          disabled={scanning || repoUrl.trim().length === 0}
          className="rounded-lg bg-[#3b82f6] px-4 py-2.5 text-[13px] font-semibold text-white shadow-[0_0_24px_-8px_rgba(59,130,246,0.95)] transition-colors hover:bg-[#2563eb] disabled:cursor-not-allowed disabled:opacity-45"
        >
          Run scan
        </button>
      </form>

      {state.kind === "error" ? (
        <p className="mt-3 font-mono text-xs text-rose-300" role="alert">
          {state.message}
        </p>
      ) : null}

      {scanning ? (
        <div
          className={`fixed inset-0 z-50 flex items-center justify-center bg-[#0e1117]/85 px-4 backdrop-blur-md transition-opacity duration-500 motion-reduce:transition-none ${
            revealed ? "opacity-100" : "opacity-0"
          }`}
        >
          <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-[#0e1117] p-6 shadow-2xl shadow-black/40 sm:p-8">
            <p className="text-xs font-semibold tracking-[0.18em] text-[#3b82f6] uppercase">Architecture firewall</p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-[#f9fafb]">
              {state.opening ? "Opening your workspace" : "Analyzing repository"}
            </h2>
            <p className="mt-2 truncate font-mono text-xs text-zinc-400">{state.repoUrl}</p>
            <ol className="mt-6 space-y-3" aria-live="polite">
              {STEPS.map((label, index) => {
                const complete = state.opening || index < state.step;
                const current = !state.opening && index === state.step;
                return (
                  <li key={label} className="flex items-start gap-3" aria-current={current ? "step" : undefined}>
                    <StepMark complete={complete} current={current} />
                    <span className={`text-sm ${complete || current ? "text-[#f9fafb]" : "text-[#f9fafb]/40"}`}>{label}</span>
                  </li>
                );
              })}
            </ol>
            <div className="mt-6 h-1 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
              <div
                className="h-full rounded-full bg-[#3b82f6] transition-all duration-500 motion-reduce:transition-none"
                style={{ width: `${progress}%` }}
              />
            </div>
            {state.opening ? (
              <p className="mt-4 text-sm text-[#3b82f6]" role="status">
                Opening your workspace...
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StepMark({ complete, current }: { complete: boolean; current: boolean }) {
  if (complete) {
    return (
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#34d399]/15 text-[11px] font-bold text-[#34d399]">
        ✓
      </span>
    );
  }
  if (current) {
    return (
      <span className="mt-0.5 h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-[#3b82f6]/25 border-t-[#3b82f6] motion-reduce:animate-none" />
    );
  }
  return <span className="mt-0.5 h-5 w-5 shrink-0 rounded-full border border-white/15" />;
}
