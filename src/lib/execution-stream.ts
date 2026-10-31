import {
  violationCategory,
  type FirewallReport,
  type FirewallSeverity,
  type FirewallViolation,
} from "@/lib/firewall-contract";
import type { HealingAuditEntry } from "@/lib/healing-audit";

export type StreamBadge = "HEALED" | "FLAGGED" | "BLOCKED" | "CLEAN";

export type ExecutionEvent = {
  id: string;
  timestamp: string;
  severity: FirewallSeverity | null;
  badge: StreamBadge;
  category: string;
  ref: string;
  filePath: string;
  line: number | null;
  summary: string;
  diff: string | null;
  verified: boolean;
};

function oneLine(value: string): string {
  const flat = value.replace(/\s+/g, " ").trim();
  return flat.length > 160 ? `${flat.slice(0, 157)}...` : flat;
}

function violationSummary(violation: FirewallViolation): string {
  const category = violationCategory(violation);
  if (category === "CLIENT_DB_EXPOSURE") return "Blocked client supabase.from() query on the scanned tree";
  if (category === "SECRET_LEAK") return "Blocked a hardcoded secret before it reached the branch";
  if (category === "VULNERABLE_DEPENDENCY") return "Blocked a dependency below the floor";
  return oneLine(violation.message);
}

function healSummary(entry: HealingAuditEntry): string {
  if (entry.category === "leaks" && entry.outcome === "healed") {
    return "Rewrote client supabase.from() query into secure server action -> auto-committed to branch";
  }
  if (entry.category === "leaks") return "Leak patch reverted on the pull request branch";
  if (entry.outcome === "healed") return "Architecture patch auto-committed to branch";
  return "Architecture patch reverted on the pull request branch";
}

export function leaksAutoHealed(entries: readonly HealingAuditEntry[]): number {
  return entries.filter((entry) => entry.category === "leaks" && entry.outcome === "healed").length;
}

export function buildExecutionEvents(
  report: FirewallReport | null,
  history: readonly HealingAuditEntry[]
): ExecutionEvent[] {
  const events: ExecutionEvent[] = [];

  for (const [index, entry] of history.entries()) {
    const healed = entry.outcome === "healed";
    events.push({
      id: `heal:${entry.timestamp}:${entry.filePath}:${index}`,
      timestamp: entry.timestamp,
      severity: entry.category === "leaks" ? "CRITICAL" : "HIGH",
      badge: healed ? "HEALED" : "BLOCKED",
      category: entry.category,
      ref: entry.ref ?? "pr",
      filePath: entry.filePath,
      line: null,
      summary: healSummary(entry),
      diff: null,
      verified: healed,
    });
  }

  if (report && report.violations.length === 0 && history.length === 0) {
    events.push({
      id: "clean",
      timestamp: report.timestamp,
      severity: null,
      badge: "CLEAN",
      category: "—",
      ref: "scan",
      filePath: "—",
      line: null,
      summary: "0 leaks, 0 violations. Ready to merge.",
      diff: null,
      verified: false,
    });
  }

  if (report) {
    for (const [index, violation] of report.violations.entries()) {
      events.push({
        id: `scan:${violation.filePath}:${violation.line}:${index}`,
        timestamp: report.timestamp,
        severity: violation.severity,
        badge: "FLAGGED",
        category: violationCategory(violation),
        ref: "scan",
        filePath: violation.filePath,
        line: violation.line,
        summary: violationSummary(violation),
        diff: violation.remediation?.diff ?? null,
        verified: false,
      });
    }
  }

  if (events.length === 0) {
    events.push({
      id: "watch",
      timestamp: "",
      severity: null,
      badge: "CLEAN",
      category: "—",
      ref: "—",
      filePath: "—",
      line: null,
      summary: "No autonomous interventions recorded yet. Engine is watching.",
      diff: null,
      verified: false,
    });
  }

  return events.sort((left, right) => left.timestamp.localeCompare(right.timestamp) || left.id.localeCompare(right.id));
}

export function formatStreamStamp(timestamp: string): string {
  if (!timestamp) return "—";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  return timestamp.slice(0, 19).replace("T", " ");
}
