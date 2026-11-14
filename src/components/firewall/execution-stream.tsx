"use client";

import { useEffect, useMemo, useState } from "react";
import {
  FilePathPill,
  StatusDot,
  elevatedSurfaceClass,
  formatBoundaryId,
  mutedLabelClass,
  panelClass,
  rowHoverClass,
  sectionLabelClass,
  severityLabel,
  severityTone,
  tableCellClass,
  tableHeadClass,
} from "@/components/firewall/firewall-ui";
import type { FirewallReport } from "@/lib/firewall-contract";
import {
  buildExecutionEvents,
  formatStreamStamp,
  type ExecutionEvent,
  type StreamBadge,
} from "@/lib/execution-stream";
import type { HealingAuditEntry } from "@/lib/healing-audit";

const DEFAULT_VISIBLE_EVENTS = 15;

function badgeTone(badge: StreamBadge): "ok" | "warn" | "danger" | "neutral" {
  if (badge === "HEALED") return "ok";
  if (badge === "FLAGGED") return "warn";
  if (badge === "BLOCKED") return "danger";
  return "neutral";
}

function badgeLabel(badge: StreamBadge): string {
  if (badge === "HEALED") return "PR opened";
  if (badge === "FLAGGED") return "Open";
  if (badge === "BLOCKED") return "PR closed";
  return "Clear";
}

function diffLineClass(line: string): string {
  if (line.startsWith("+") && !line.startsWith("+++")) return "text-emerald-400/90";
  if (line.startsWith("-") && !line.startsWith("---")) return "text-red-400/90";
  return "text-zinc-500";
}

function StreamRow({ event }: { event: ExecutionEvent }) {
  const [open, setOpen] = useState(false);
  const lines = (event.diff ?? "No patch was recorded for this event.").split("\n");
  const stamp = formatStreamStamp(event.timestamp);
  const hasPath = event.filePath !== "—";

  return (
    <>
      <tr className={`border-t border-white/[0.04] ${rowHoverClass}`}>
        <td className={`${tableCellClass} w-28 whitespace-nowrap text-xs text-zinc-500`}>
          <time dateTime={event.timestamp || undefined} title={stamp.title || undefined}>
            {stamp.label}
          </time>
        </td>
        <td className={`${tableCellClass} w-28`}>
          <span className="inline-flex items-center gap-2 text-xs text-zinc-400">
            <StatusDot tone={badgeTone(event.badge)} />
            {badgeLabel(event.badge)}
          </span>
        </td>
        <td className={`${tableCellClass} w-28`}>
          {event.severity ? (
            <span className="inline-flex items-center gap-2 text-xs text-zinc-400">
              <StatusDot tone={severityTone(event.severity)} />
              {severityLabel(event.severity)}
            </span>
          ) : (
            <span className="text-xs text-zinc-600">—</span>
          )}
        </td>
        <td className={`${tableCellClass} max-w-[10rem] truncate text-xs text-zinc-500`}>
          {event.category !== "—" ? formatBoundaryId(event.category) : "—"}
        </td>
        <td className={`${tableCellClass} max-w-[18rem]`}>
          {hasPath ? (
            <button
              type="button"
              className="block w-full min-w-0 text-left hover:opacity-90"
              aria-expanded={open}
              onClick={() => setOpen((current) => !current)}
            >
              <FilePathPill path={event.filePath} line={event.line || undefined} />
            </button>
          ) : (
            <span className="text-xs text-zinc-600">—</span>
          )}
        </td>
        <td className={`${tableCellClass} max-w-[20rem] truncate text-zinc-400`}>{event.summary}</td>
      </tr>
      {open ? (
        <tr className="border-t border-white/[0.04] bg-white/[0.015]">
          <td colSpan={6} className="px-4 py-4">
            <pre className="overflow-x-auto rounded-lg border border-white/[0.06] bg-black/40 px-3 py-2.5 font-mono text-[11px] leading-5">
              {lines.map((line, index) => (
                <div key={`${event.id}:${index}`} className={diffLineClass(line)}>
                  {line || " "}
                </div>
              ))}
            </pre>
          </td>
        </tr>
      ) : null}
    </>
  );
}

export default function ExecutionStream({
  repo,
  report,
  history,
}: {
  repo: string | null;
  report: FirewallReport | null;
  history: readonly HealingAuditEntry[];
}) {
  const events = useMemo(() => buildExecutionEvents(report, history), [report, history]);
  const [visibleCount, setVisibleCount] = useState(DEFAULT_VISIBLE_EVENTS);
  useEffect(() => {
    setVisibleCount(DEFAULT_VISIBLE_EVENTS);
  }, [report?.timestamp, history.length, repo]);
  const stats = [
    { label: "Events", value: events.length },
    { label: "Open", value: events.filter((event) => event.badge === "FLAGGED").length },
    { label: "Fix PRs", value: events.filter((event) => event.badge === "HEALED").length },
  ];
  const visibleEvents = events.slice(0, visibleCount);
  const hasMore = events.length > visibleCount;
  const canCollapse = visibleCount > DEFAULT_VISIBLE_EVENTS && events.length > DEFAULT_VISIBLE_EVENTS;

  return (
    <section className="space-y-4">
      <div className={`${elevatedSurfaceClass} grid grid-cols-3 overflow-hidden`}>
        {stats.map((stat, index) => (
          <div
            key={stat.label}
            className={`px-5 py-4 ${index < stats.length - 1 ? "border-r border-zinc-800/60" : ""}`}
          >
            <dt className={mutedLabelClass}>{stat.label}</dt>
            <dd className="mt-1 text-2xl font-medium tabular-nums tracking-tight text-zinc-50">{stat.value}</dd>
          </div>
        ))}
      </div>

      <div className={panelClass}>
        <header className="border-b border-zinc-800/60 px-5 py-4">
          <p className={mutedLabelClass}>This scan and fix pull requests</p>
          <h2 className={`mt-1 truncate ${sectionLabelClass}`}>{repo ?? "local"}</h2>
        </header>

        {events.length === 0 ? (
          <p className="px-5 py-8 text-sm text-zinc-500">No execution events yet.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px]">
                <thead>
                  <tr className={tableHeadClass}>
                    <th className="px-5 py-2.5 font-medium">Time</th>
                    <th className="px-4 py-2.5 font-medium">Result</th>
                    <th className="px-4 py-2.5 font-medium">Severity</th>
                    <th className="px-4 py-2.5 font-medium">Category</th>
                    <th className="px-4 py-2.5 font-medium">Location</th>
                    <th className="px-5 py-2.5 font-medium">Summary</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleEvents.map((event) => (
                    <StreamRow key={event.id} event={event} />
                  ))}
                </tbody>
              </table>
            </div>
            {hasMore || canCollapse ? (
              <div className="flex items-center justify-between gap-3 border-t border-zinc-800/60 px-5 py-3">
                <p className={mutedLabelClass}>
                  Showing{" "}
                  <span className="tabular-nums text-zinc-300">{visibleEvents.length}</span> of{" "}
                  <span className="tabular-nums text-zinc-300">{events.length}</span>
                </p>
                <div className="flex items-center gap-2">
                  {canCollapse ? (
                    <button
                      type="button"
                      onClick={() => setVisibleCount(DEFAULT_VISIBLE_EVENTS)}
                      className="rounded-md px-2.5 py-1 text-xs text-zinc-500 transition-colors hover:bg-zinc-900/50 hover:text-zinc-200"
                    >
                      Show less
                    </button>
                  ) : null}
                  {hasMore ? (
                    <button
                      type="button"
                      onClick={() =>
                        setVisibleCount((current) =>
                          Math.min(current + DEFAULT_VISIBLE_EVENTS, events.length)
                        )
                      }
                      className="rounded-md border border-zinc-700/80 bg-zinc-900/50 px-2.5 py-1 text-xs font-medium text-zinc-200 transition-colors hover:bg-zinc-900"
                    >
                      Show more
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
