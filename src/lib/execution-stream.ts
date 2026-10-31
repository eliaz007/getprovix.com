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

function describeRecordedAction(note: string | null | undefined): string | null {
  const text = note?.trim() ?? "";
  if (!text || /architecture patch auto-committed/i.test(text)) return null;
  if (/handle errors/i.test(text)) {
    return "Wrapped unhandled async database and fetch calls in try/catch with an error response";
  }
  if (/split .+ into modules/i.test(text) || /barrel/i.test(text)) {
    return "Split the file into modules and replaced it with a barrel re-export";
  }
  if (/supabase\.from|server action/i.test(text)) {
    return "Rewrote client supabase.from() query into secure server action";
  }
  return oneLine(text.replace(/^(fix|refactor|chore|feat):\s*/i, ""));
}

function describeViolationAction(violation: FirewallViolation): string | null {
  const rule = violation.rule.toLowerCase();
  if (rule.includes("error")) {
    return "Wrapped unhandled async database and fetch calls in try/catch with an error response";
  }
  if (rule.includes("bloat")) {
    return "Split an oversized file into modules and replaced it with a barrel re-export";
  }
  if (rule.includes("boundary")) return "Enforced an AST boundary by moving a cross-layer import";
  if (rule.includes("circular")) return "Broke a circular dependency in the module graph";
  if (rule.includes("orphan") || rule.includes("dead")) {
    return "Cleared orphaned module weight from the architecture graph";
  }
  if (rule.includes("secret")) return "Moved a hardcoded secret behind a server-side environment read";
  if (rule.includes("client") || rule.includes("query") || rule.includes("supabase")) {
    return "Rewrote client supabase.from() query into secure server action";
  }
  if (rule.includes("depend")) return "Raised a dependency to meet the security floor";
  const message = oneLine(violation.message);
  if (!message || /architecture patch auto-committed/i.test(message)) return null;
  return message;
}

function healSummary(entry: HealingAuditEntry, violation?: FirewallViolation): string {
  if (entry.category === "leaks" && entry.outcome === "healed") {
    return "Rewrote client supabase.from() query into secure server action -> auto-committed to branch";
  }
  if (entry.category === "leaks") return "Leak patch reverted on the pull request branch";

  const action =
    describeRecordedAction(entry.note) ??
    (violation ? describeViolationAction(violation) : null) ??
    (entry.ref?.includes("split")
      ? "Split the file into modules and replaced it with a barrel re-export"
      : null);

  if (entry.outcome === "healed") {
    return action ?? `Applied an architecture fix in ${entry.filePath}`;
  }
  if (!action) return "Architecture patch reverted on the pull request branch";
  return `${action} — reverted on the pull request branch`;
}

export function leaksAutoHealed(entries: readonly HealingAuditEntry[]): number {
  return entries.filter((entry) => entry.category === "leaks" && entry.outcome === "healed").length;
}

export function buildExecutionEvents(
  report: FirewallReport | null,
  history: readonly HealingAuditEntry[]
): ExecutionEvent[] {
  const events: ExecutionEvent[] = [];
  const violationByFile = new Map<string, FirewallViolation>();
  for (const violation of report?.violations ?? []) {
    if (!violationByFile.has(violation.filePath)) violationByFile.set(violation.filePath, violation);
  }

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
      summary: healSummary(entry, violationByFile.get(entry.filePath)),
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

/** Relative when recent, otherwise a short clock time. `title` is the full local timestamp. */
export function formatStreamStamp(timestamp: string): { label: string; title: string } {
  if (!timestamp) return { label: "—", title: "" };
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return { label: timestamp, title: timestamp };
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
    return { label: `${Math.max(1, Math.floor(deltaMs / minute))}m ago`, title };
  }
  if (deltaMs >= 0 && deltaMs < day) return { label: `${Math.floor(deltaMs / hour)}h ago`, title };
  if (deltaMs >= 0 && deltaMs < 7 * day) return { label: `${Math.floor(deltaMs / day)}d ago`, title };
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
