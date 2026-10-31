export const HEALING_AUDIT_CATEGORIES = ["violations", "leaks"] as const;
export type HealingAuditCategory = (typeof HEALING_AUDIT_CATEGORIES)[number];

export const HEALING_AUDIT_OUTCOMES = ["healed", "reverted"] as const;
export type HealingAuditOutcome = (typeof HEALING_AUDIT_OUTCOMES)[number];

export type HealingAuditEntry = {
  timestamp: string;
  filePath: string;
  category: HealingAuditCategory;
  outcome: HealingAuditOutcome;
  /** Pull request number (`#41`) or the head branch when no number was stored. */
  ref: string | null;
  /** Recorded pull-request title or commit subject, when the audit log has one. */
  note?: string | null;
};

export type HealingAuditResponse = {
  ok: boolean;
  entries: HealingAuditEntry[];
  message?: string;
};

const SECURITY_BRANCH_PREFIX = "provix/security-";

export function healingAuditCategory(branch: string | null): HealingAuditCategory {
  return branch?.startsWith(SECURITY_BRANCH_PREFIX) ? "leaks" : "violations";
}

export function healingAuditOutcome(status: string): HealingAuditOutcome {
  return status === "closed" ? "reverted" : "healed";
}

export function healingAuditLabel(outcome: HealingAuditOutcome): string {
  return outcome === "healed" ? "healed successfully" : "patch reverted";
}

export function toHealingAuditEntry(row: {
  file_path: unknown;
  status: unknown;
  branch: unknown;
  pull_number?: unknown;
  updated_at: unknown;
  created_at: unknown;
}): HealingAuditEntry | null {
  const filePath = typeof row.file_path === "string" ? row.file_path.replace(/\\/g, "/").replace(/^\/+/, "") : "";
  if (!filePath) return null;
  const status = typeof row.status === "string" ? row.status : "open";
  const branch = typeof row.branch === "string" ? row.branch : null;
  const pullNumber = typeof row.pull_number === "number" && Number.isInteger(row.pull_number) ? row.pull_number : null;
  const updated = typeof row.updated_at === "string" ? row.updated_at : null;
  const created = typeof row.created_at === "string" ? row.created_at : null;
  return {
    timestamp: updated ?? created ?? new Date(0).toISOString(),
    filePath,
    category: healingAuditCategory(branch),
    outcome: healingAuditOutcome(status),
    ref: pullNumber !== null ? `#${pullNumber}` : branch,
  };
}
