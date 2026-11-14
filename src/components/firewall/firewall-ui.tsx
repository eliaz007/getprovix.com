import type { FirewallSeverity } from "@/lib/firewall-contract";

/** Shared Linear/Vercel-style primitives for firewall dashboard surfaces. */

export const panelClass =
  "overflow-hidden rounded-xl border border-zinc-800/80 bg-zinc-950/60";

/** Elevated metric / summary surfaces with subtle depth. */
export const elevatedSurfaceClass =
  "rounded-xl border border-zinc-800/80 bg-gradient-to-b from-zinc-900/60 to-zinc-950/90 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]";

/** Interactive finding rows inside a divided list container. */
export const findingRowClass =
  "group/row px-4 py-3.5 transition-colors hover:bg-zinc-900/40";

export const findingListClass = "divide-y divide-zinc-800/60";

export const sectionLabelClass =
  "text-[13px] font-medium tracking-tight text-zinc-100";

export const mutedLabelClass = "text-xs text-zinc-500";

export const tableHeadClass =
  "border-b border-zinc-800/60 text-left text-xs font-medium text-zinc-500";

export const tableCellClass = "px-4 py-3 text-sm text-zinc-300";

export const rowHoverClass = "group/row hover:bg-zinc-900/40";

export const filterChipClass = (active: boolean) =>
  `inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-colors ${
    active
      ? "bg-white text-zinc-950"
      : "text-zinc-500 hover:bg-zinc-900/50 hover:text-zinc-300"
  }`;

/** Primary row action — quiet until the row is hovered. */
export const rowPrimaryActionClass =
  "inline-flex items-center gap-1.5 rounded-md border border-zinc-700/60 bg-zinc-900/50 px-2.5 py-1 text-xs font-medium text-zinc-200 opacity-80 transition-all hover:border-zinc-600 hover:bg-zinc-900 hover:text-white group-hover/row:opacity-100 disabled:cursor-wait disabled:opacity-50";

/** Ghost / secondary inspection actions. */
export const rowGhostActionClass =
  "inline-flex items-center rounded-md px-2 py-1 text-xs text-zinc-500 transition-colors hover:bg-zinc-900/50 hover:text-zinc-200 disabled:cursor-wait disabled:opacity-60";

export type StatusPillTone = "ok" | "warn" | "danger" | "neutral" | "info";

export function statusPillClass(tone: StatusPillTone): string {
  switch (tone) {
    case "ok":
      return "border-emerald-500/20 bg-emerald-500/10 text-emerald-400";
    case "warn":
      return "border-amber-500/20 bg-amber-500/10 text-amber-400";
    case "danger":
      return "border-rose-500/20 bg-rose-500/10 text-rose-400";
    case "info":
      return "border-sky-500/20 bg-sky-500/10 text-sky-400";
    default:
      return "border-zinc-700/50 bg-zinc-900/40 text-zinc-400";
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
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium tracking-wide ${statusPillClass(tone)}`}
    >
      {label}
    </span>
  );
}

/** Split a repo-relative path into directory + basename for IDE-style display. */
export function splitFilePath(path: string): { dir: string; file: string } {
  const normalized = String(path || "").replace(/\\/g, "/");
  const idx = normalized.lastIndexOf("/");
  if (idx < 0) return { dir: "", file: normalized || "—" };
  return { dir: normalized.slice(0, idx + 1), file: normalized.slice(idx + 1) || "—" };
}

/**
 * IDE-style path: bright `filename.tsx:180` first, then muted directory.
 * Never front-truncates with `...`. Full path stays on the title tooltip.
 */
export function FilePathPill({
  path,
  line,
  className = "",
}: {
  path: string;
  line?: number;
  className?: string;
}) {
  const { dir, file } = splitFilePath(path);
  const fileWithLine = line != null && line > 0 ? `${file}:${line}` : file;
  const full = line != null && line > 0 ? `${path}:${line}` : path;
  return (
    <span
      title={full}
      className={`inline-flex min-w-0 max-w-full items-baseline gap-1.5 leading-none ${className}`}
    >
      <span className="shrink-0 font-mono text-sm font-medium text-zinc-100">{fileWithLine}</span>
      {dir ? <span className="min-w-0 truncate font-mono text-xs text-zinc-500">{dir}</span> : null}
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

const BOUNDARY_LABELS: Record<string, string> = {
  CLIENT_DB_EXPOSURE: "Database exposure",
  SECRET_LEAK: "Secret leak",
  VULNERABLE_DEPENDENCY: "Vulnerable dependency",
  INSECURE_AUTH_SESSION: "Insecure session auth",
  ARCHITECTURAL_BLOAT: "Oversized module",
};

export function formatBoundaryId(id: string): string {
  const known = BOUNDARY_LABELS[id] ?? BOUNDARY_LABELS[id.toUpperCase()];
  if (known) return known;
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
