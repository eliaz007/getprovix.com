"use client";

import { useEffect, useState, type ReactNode } from "react";
import { healingAuditLabel, type HealingAuditEntry, type HealingAuditResponse } from "@/lib/healing-audit";
import { readJsonResponse } from "@/lib/read-json-response";

type LogState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; entries: HealingAuditEntry[] }
  | { kind: "error"; message: string };

function formatStamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "Z");
}

export default function HealingAuditLog({ repo }: { repo: string | null }): ReactNode {
  const [state, setState] = useState<LogState>({ kind: "idle" });

  useEffect(() => {
    if (!repo) {
      setState({ kind: "idle" });
      return;
    }
    let active = true;
    setState({ kind: "loading" });
    void (async () => {
      try {
        const response = await fetch(`/api/firewall/history?repo=${encodeURIComponent(repo)}`, { cache: "no-store" });
        const payload = await readJsonResponse<HealingAuditResponse>(response);
        if (!active) return;
        if (!response.ok || !payload.ok) {
          setState({ kind: "error", message: payload.message ?? "The healing log could not be read." });
          return;
        }
        setState({ kind: "ready", entries: payload.entries });
      } catch (error) {
        if (!active) return;
        setState({
          kind: "error",
          message: error instanceof Error ? error.message : "The healing log could not be read.",
        });
      }
    })();
    return () => {
      active = false;
    };
  }, [repo]);

  const line =
    state.kind === "idle"
      ? "no repository selected"
      : state.kind === "loading"
        ? "reading log"
        : state.kind === "error"
          ? state.message
          : state.entries.length === 0
            ? "no interventions recorded"
            : null;

  return (
    <section aria-labelledby="healing-log-heading" className="overflow-hidden rounded-md border border-zinc-800 bg-zinc-950 font-mono">
      <header className="border-b border-zinc-800 px-4 py-3">
        <p id="healing-log-heading" className="text-[11px] tracking-[0.16em] text-zinc-500 uppercase">
          history
        </p>
        <p className="mt-1 text-sm text-zinc-100">{repo ?? "—"}</p>
      </header>
      {line ? (
        <p className="px-4 py-4 text-[12px] text-zinc-500" role="status">
          {line}
        </p>
      ) : null}
      {state.kind === "ready" && state.entries.length > 0 ? (
        <ol>
          <li className="grid grid-cols-1 gap-1 border-b border-zinc-800 px-4 py-2 text-[10px] tracking-[0.14em] text-zinc-500 uppercase sm:grid-cols-[12rem_minmax(0,1fr)_6.5rem_auto] sm:items-center sm:gap-4">
            <span>timestamp</span>
            <span>path</span>
            <span>category</span>
            <span>outcome</span>
          </li>
          {state.entries.map((entry) => (
            <li
              key={`${entry.timestamp}:${entry.filePath}:${entry.category}`}
              className="grid grid-cols-1 gap-1 border-b border-zinc-800 px-4 py-3 text-[12px] last:border-b-0 sm:grid-cols-[12rem_minmax(0,1fr)_6.5rem_auto] sm:items-center sm:gap-4"
            >
              <time dateTime={entry.timestamp} className="text-zinc-500">
                {formatStamp(entry.timestamp)}
              </time>
              <span className="truncate text-zinc-100">{entry.filePath}</span>
              <span className="text-zinc-400">{entry.category}</span>
              <span
                className={
                  entry.outcome === "healed"
                    ? "w-fit rounded-full border border-zinc-200 bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-950"
                    : "w-fit rounded-full border border-zinc-600 px-2 py-0.5 text-[11px] text-zinc-300"
                }
              >
                {healingAuditLabel(entry.outcome)}
              </span>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
