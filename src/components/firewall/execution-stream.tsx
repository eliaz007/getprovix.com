"use client";

import { useState } from "react";
import {
  StatusDot,
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

function badgeTone(badge: StreamBadge): "ok" | "warn" | "danger" | "neutral" {
  if (badge === "HEALED") return "ok";
  if (badge === "FLAGGED") return "warn";
  if (badge === "BLOCKED") return "danger";
  return "neutral";
}

function badgeLabel(badge: StreamBadge): string {
  if (badge === "HEALED") return "Healed";
  if (badge === "FLAGGED") return "Flagged";
  if (badge === "BLOCKED") return "Blocked";
  return "Info";
}

function diffLineClass(line: string): string {
  if (line.startsWith("+") && !line.startsWith("+++")) return "text-emerald-400/90";
  if (line.startsWith("-") && !line.startsWith("---")) return "text-red-400/90";
  return "text-zinc-500";
}

function StreamRow({ event }: { event: ExecutionEvent }) {
  const [open, setOpen] = useState(false);
  const lines = (event.diff ?? "No patch was recorded for this event.").split("\n");
  const location =
    event.filePath !== "—"
      ? `${event.filePath}${event.line ? `:${event.line}` : ""}`
      : "—";
  const stamp = formatStreamStamp(event.timestamp);

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
        <td className={`${tableCellClass} max-w-[16rem]`}>
          <button
            type="button"
            className="block w-full truncate text-left font-mono text-xs text-zinc-200 hover:text-white"
            aria-expanded={open}
            onClick={() => setOpen((current) => !current)}
          >
            {location}
          </button>
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
  const events = buildExecutionEvents(report, history);
  const stats = [
    { label: "Events", value: events.length },
    { label: "Flagged", value: events.filter((event) => event.badge === "FLAGGED").length },
    { label: "Healed", value: events.filter((event) => event.badge === "HEALED").length },
  ];

  return (
    <section className={panelClass}>
      <header className="border-b border-white/[0.06] px-5 py-4">
        <p className={mutedLabelClass}>Execution stream</p>
        <h2 className={`mt-1 truncate ${sectionLabelClass}`}>{repo ?? "local"}</h2>
      </header>
      <dl className="grid grid-cols-3 border-b border-white/[0.06]">
        {stats.map((stat, index) => (
          <div
            key={stat.label}
            className={`px-5 py-4 ${index < stats.length - 1 ? "border-r border-white/[0.06]" : ""}`}
          >
            <dt className={mutedLabelClass}>{stat.label}</dt>
            <dd className="mt-1 text-2xl font-medium tabular-nums tracking-tight text-zinc-50">{stat.value}</dd>
          </div>
        ))}
      </dl>

      {events.length === 0 ? (
        <p className="px-5 py-8 text-sm text-zinc-500">No execution events yet.</p>
      ) : (
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
              {events.map((event) => (
                <StreamRow key={event.id} event={event} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
