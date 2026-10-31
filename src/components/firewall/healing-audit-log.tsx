"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  FilePathPill,
  StatusPill,
  formatAuditTimestamp,
  mutedLabelClass,
  panelClass,
  rowHoverClass,
  sectionLabelClass,
} from "@/components/firewall/firewall-ui";
import { healingAuditLabel, type HealingAuditEntry, type HealingAuditResponse } from "@/lib/healing-audit";
import { readJsonResponse } from "@/lib/read-json-response";

type LogState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; entries: HealingAuditEntry[] }
  | { kind: "error"; message: string };

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
      ? "No repository selected"
      : state.kind === "loading"
        ? "Reading log…"
        : state.kind === "error"
          ? state.message
          : state.entries.length === 0
            ? "No interventions recorded"
            : null;

  return (
    <section aria-labelledby="healing-log-heading" className={panelClass}>
      <header className="border-b border-white/[0.06] px-5 py-4">
        <p id="healing-log-heading" className={sectionLabelClass}>
          History
        </p>
        <p className={`mt-1 font-mono text-xs text-zinc-400`}>{repo ?? "—"}</p>
      </header>
      {line ? (
        <p className="px-5 py-6 text-sm text-zinc-500" role="status">
          {line}
        </p>
      ) : null}
      {state.kind === "ready" && state.entries.length > 0 ? (
        <ul>
          {state.entries.map((entry) => {
            const stamp = formatAuditTimestamp(entry.timestamp);
            const healed = entry.outcome === "healed";
            return (
              <li
                key={`${entry.timestamp}:${entry.filePath}:${entry.category}`}
                className={`flex flex-col gap-2 border-t border-white/[0.04] px-5 py-3 sm:flex-row sm:items-center sm:justify-between ${rowHoverClass}`}
              >
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill label={healed ? "Passed" : "Needs review"} tone={healed ? "ok" : "warn"} />
                    <span className={mutedLabelClass}>{entry.category}</span>
                    <FilePathPill path={entry.filePath} />
                  </div>
                  <p className="text-xs text-zinc-500">{healingAuditLabel(entry.outcome)}</p>
                </div>
                <time dateTime={entry.timestamp} title={stamp.title} className="shrink-0 text-xs tabular-nums text-zinc-500">
                  {stamp.label}
                </time>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
