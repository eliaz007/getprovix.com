import { healingAuditCategory, healingAuditOutcome } from "@/lib/healing-audit";

/** Raw audit log shape from `healing_audits` or the autofix fallback. */
export type HealingAuditLogRow = {
  id?: string;
  file_path: string;
  branch_name?: string | null;
  category?: string | null;
  status: string;
  commit_message?: string | null;
  created_at: string;
};

export type FounderIssueTier = "critical" | "warning";

export type FounderAuditIssue = {
  id: string;
  tier: FounderIssueTier;
  filePath: string;
  label: string;
  detail: string;
  timestamp: string;
};

export type FounderHealthVerdict = "CLEAR" | "STABLE" | "ATTENTION" | "CRITICAL";

export type HealingAuditSummary = {
  verdict: FounderHealthVerdict;
  headline: string;
  detail: string;
  criticalCount: number;
  warningCount: number;
  healedCount: number;
  total: number;
  critical: FounderAuditIssue[];
  warnings: FounderAuditIssue[];
};

export type HealingSummaryResponse = {
  ok: boolean;
  summary: HealingAuditSummary;
};

function normalizeCategory(row: HealingAuditLogRow): "leaks" | "violations" {
  if (row.category === "leaks" || row.category === "violations") return row.category;
  return healingAuditCategory(row.branch_name ?? null);
}

function issueId(row: HealingAuditLogRow, index: number): string {
  if (typeof row.id === "string" && row.id.length > 0) return row.id;
  return `${row.file_path}:${row.created_at}:${index}`;
}

/** Security leaks and reverted patches are critical; architecture interventions are warnings. */
export function categorizeHealingAuditRow(
  row: HealingAuditLogRow,
  index = 0
): FounderAuditIssue {
  const category = normalizeCategory(row);
  const outcome = healingAuditOutcome(row.status);
  const filePath = row.file_path.replace(/\\/g, "/").replace(/^\/+/, "");
  const reverted = outcome === "reverted";
  const critical = category === "leaks" || reverted;
  const message = row.commit_message?.trim() || null;

  if (critical && category === "leaks" && reverted) {
    return {
      id: issueId(row, index),
      tier: "critical",
      filePath,
      label: "Reverted security patch",
      detail: message ?? "A leak fix was closed without merging.",
      timestamp: row.created_at,
    };
  }
  if (critical && category === "leaks") {
    return {
      id: issueId(row, index),
      tier: "critical",
      filePath,
      label: outcome === "healed" ? "Security leak healed" : "Security leak open",
      detail: message ?? "Secret or client-boundary exposure recorded in the healing audit.",
      timestamp: row.created_at,
    };
  }
  if (reverted) {
    return {
      id: issueId(row, index),
      tier: "critical",
      filePath,
      label: "Patch reverted",
      detail: message ?? "An autonomous architecture fix was closed without merging.",
      timestamp: row.created_at,
    };
  }
  return {
    id: issueId(row, index),
    tier: "warning",
    filePath,
    label: "Architecture intervention",
    detail: message ?? "Boundary, bloat, or structure fix recorded in the healing audit.",
    timestamp: row.created_at,
  };
}

export function buildHealingAuditSummary(rows: readonly HealingAuditLogRow[]): HealingAuditSummary {
  const issues = rows.map((row, index) => categorizeHealingAuditRow(row, index));
  const critical = issues.filter((issue) => issue.tier === "critical");
  const warnings = issues.filter((issue) => issue.tier === "warning");
  const healedCount = rows.filter((row) => healingAuditOutcome(row.status) === "healed").length;
  const revertedCount = rows.filter((row) => healingAuditOutcome(row.status) === "reverted").length;
  const leakCount = rows.filter((row) => normalizeCategory(row) === "leaks").length;

  if (rows.length === 0) {
    return {
      verdict: "CLEAR",
      headline: "No healing interventions on record.",
      detail: "The audit log is empty. Run a scan or connect the GitHub App to start monitoring.",
      criticalCount: 0,
      warningCount: 0,
      healedCount: 0,
      total: 0,
      critical: [],
      warnings: [],
    };
  }

  if (revertedCount > 0) {
    return {
      verdict: "CRITICAL",
      headline: "Founder attention required: patches were reverted.",
      detail: `${revertedCount} closed without merge. ${leakCount} security leak event${leakCount === 1 ? "" : "s"} and ${warnings.length} architecture warning${warnings.length === 1 ? "" : "s"} in the log.`,
      criticalCount: critical.length,
      warningCount: warnings.length,
      healedCount,
      total: rows.length,
      critical,
      warnings,
    };
  }

  if (leakCount > 0) {
    return {
      verdict: "ATTENTION",
      headline: "Security exposures were intercepted.",
      detail: `${leakCount} leak event${leakCount === 1 ? "" : "s"} in the healing audit. ${healedCount} intervention${healedCount === 1 ? "" : "s"} marked healed.`,
      criticalCount: critical.length,
      warningCount: warnings.length,
      healedCount,
      total: rows.length,
      critical,
      warnings,
    };
  }

  if (warnings.length > 0) {
    return {
      verdict: "STABLE",
      headline: "Architecture debt is under watch.",
      detail: `${warnings.length} architecture intervention${warnings.length === 1 ? "" : "s"} logged. No security leak events and no reverted patches.`,
      criticalCount: 0,
      warningCount: warnings.length,
      healedCount,
      total: rows.length,
      critical: [],
      warnings,
    };
  }

  return {
    verdict: "CLEAR",
    headline: "Healing audit is clean.",
    detail: `${healedCount} intervention${healedCount === 1 ? "" : "s"} healed with no open founder risks.`,
    criticalCount: 0,
    warningCount: 0,
    healedCount,
    total: rows.length,
    critical: [],
    warnings: [],
  };
}
