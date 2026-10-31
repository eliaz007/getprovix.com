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

export const rowHoverClass = "hover:bg-white/[0.02]";

export const filterChipClass = (active: boolean) =>
  `inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-colors ${
    active
      ? "bg-white text-zinc-950"
      : "text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300"
  }`;

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
