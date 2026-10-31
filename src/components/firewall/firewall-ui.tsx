import type { FirewallSeverity } from "@/lib/firewall-contract";

/** Shared Linear/Vercel-style primitives for firewall dashboard surfaces. */

export const panelClass =
  "overflow-hidden rounded-xl border border-white/[0.06] bg-[#0A0A0B]";

export const sectionLabelClass =
  "text-[13px] font-medium tracking-tight text-zinc-100";

export const mutedLabelClass = "text-xs text-zinc-500";

export const tableHeadClass =
  "border-b border-white/[0.06] text-left text-xs font-medium text-zinc-500";

export const tableCellClass = "px-4 py-3 text-sm text-zinc-300";

export const rowHoverClass = "group/row hover:bg-white/[0.02]";

export const filterChipClass = (active: boolean) =>
  `inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-colors ${
    active
      ? "bg-white text-zinc-950"
      : "text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300"
  }`;

/** Primary row action — quiet until the row is hovered. */
export const rowPrimaryActionClass =
  "inline-flex items-center gap-1.5 rounded-md border border-white/[0.10] bg-white/[0.04] px-2.5 py-1 text-xs font-medium text-zinc-200 opacity-80 transition-all hover:border-white/20 hover:bg-white/[0.08] hover:text-white group-hover/row:opacity-100 disabled:cursor-wait disabled:opacity-50";

/** Ghost / secondary inspection actions. */
export const rowGhostActionClass =
  "inline-flex items-center rounded-md px-2 py-1 text-xs text-zinc-500 transition-colors hover:bg-white/[0.04] hover:text-zinc-200 disabled:cursor-wait disabled:opacity-60";

export type StatusPillTone = "ok" | "warn" | "danger" | "neutral" | "info";

export function statusPillClass(tone: StatusPillTone): string {
  switch (tone) {
    case "ok":
      return "border-emerald-500/25 bg-emerald-500/10 text-emerald-300";
    case "warn":
      return "border-amber-500/25 bg-amber-500/10 text-amber-200";
    case "danger":
      return "border-rose-500/25 bg-rose-500/10 text-rose-300";
    case "info":
      return "border-sky-500/25 bg-sky-500/10 text-sky-300";
    default:
      return "border-white/[0.08] bg-white/[0.03] text-zinc-400";
  }
}

export function StatusPill({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: StatusPillTone;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium tracking-wide ${statusPillClass(tone)}`}
    >
      {label}
    </span>
  );
}

/** Monospace path chip with truncation + native title tooltip. */
export function FilePathPill({
  path,
  line,
  className = "",
}: {
  path: string;
  line?: number;
  className?: string;
}) {
  const label = line != null && line > 0 ? `${path}:${line}` : path;
  const short =
    path.length > 42 ? `…${path.slice(-40)}` : path;
  const display = line != null && line > 0 ? `${short}:${line}` : short;
  return (
    <span
      title={label}
      className={`inline-flex max-w-full items-center truncate rounded-md border border-white/[0.08] bg-black/40 px-2 py-0.5 font-mono text-[11px] text-zinc-300 ${className}`}
    >
      {display}
    </span>
  );
}

export function StatusDot({
  tone = "neutral",
}: {
  tone?: "ok" | "warn" | "danger" | "neutral";
}) {
  const color =
    tone === "ok"
      ? "bg-emerald-400"
      : tone === "warn"
        ? "bg-amber-400"
        : tone === "danger"
          ? "bg-red-400"
          : "bg-zinc-500";
  return <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${color}`} aria-hidden />;
}

export function severityTone(
  severity: FirewallSeverity | "HIGH / MEDIUM" | string
): "ok" | "warn" | "danger" | "neutral" {
  if (severity === "CRITICAL") return "danger";
  if (severity === "HIGH" || severity === "HIGH / MEDIUM") return "warn";
  if (severity === "MEDIUM") return "warn";
  if (severity === "LOW") return "neutral";
  return "neutral";
}

export function severityLabel(severity: string): string {
  if (severity === "HIGH / MEDIUM") return "High";
  return severity.charAt(0) + severity.slice(1).toLowerCase();
}

export function formatBoundaryId(id: string): string {
  return id
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/** Compact absolute or relative timestamp; full ISO available via title. */
export function formatAuditTimestamp(iso: string): { label: string; title: string } {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return { label: iso, title: iso };
  const title = date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const deltaMs = Date.now() - date.getTime();
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (deltaMs >= 0 && deltaMs < minute) return { label: "Just now", title };
  if (deltaMs >= 0 && deltaMs < hour) {
    const mins = Math.max(1, Math.floor(deltaMs / minute));
    return { label: `${mins}m ago`, title };
  }
  if (deltaMs >= 0 && deltaMs < day) {
    const hours = Math.floor(deltaMs / hour);
    return { label: `${hours}h ago`, title };
  }
  if (deltaMs >= 0 && deltaMs < 7 * day) {
    const days = Math.floor(deltaMs / day);
    return { label: `${days}d ago`, title };
  }
  return {
    label: date.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }),
    title,
  };
}
