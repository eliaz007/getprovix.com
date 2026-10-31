import { isSecurityCategory, violationCategory, type FirewallReport, type FirewallSeverity, type FirewallViolation } from "@/lib/firewall-contract";
import type { HealingAuditEntry } from "@/lib/healing-audit";

export const SECURITY_BOUNDARIES = ["CLIENT_DB_EXPOSURE", "SECRET_LEAK", "VULNERABLE_DEPENDENCY"] as const;
export type SecurityBoundary = (typeof SECURITY_BOUNDARIES)[number];

export type IntegrityPosture = "OPTIMAL" | "DEGRADED" | "AT_RISK";
export type ReviewFixStatus = "AUTO_HEALED" | "FLAGGED_FOR_REVIEW" | "COMPILE_ABORTED";

export type BoundaryMetric = {
  id: SecurityBoundary;
  severity: "CRITICAL" | "HIGH / MEDIUM";
  intercepted: number;
  healed: number;
  flagged: number;
  status: "SECURE" | "ACTION_REQUIRED";
};

export type ReviewFinding = {
  id: string;
  severity: FirewallSeverity;
  category: string;
  filePath: string;
  line: number;
  fixStatus: ReviewFixStatus;
  summary: string;
  diff: string | null;
  note: string;
};

export type IntegrityMetrics = {
  score: number | null;
  posture: IntegrityPosture | null;
  letter: string;
  statusText: string;
  healed: number;
  healRate: number | null;
  openExposures: number;
  latencyLabel: string;
  boundaries: BoundaryMetric[];
  queue: ReviewFinding[];
};

const BOUNDARY_SEVERITY: Record<SecurityBoundary, BoundaryMetric["severity"]> = {
  CLIENT_DB_EXPOSURE: "CRITICAL",
  SECRET_LEAK: "CRITICAL",
  VULNERABLE_DEPENDENCY: "HIGH / MEDIUM",
};

export function integrityPosture(score: number | null): { posture: IntegrityPosture | null; letter: string } {
  if (score === null) return { posture: null, letter: "—" };
  if (score >= 95) return { posture: "OPTIMAL", letter: "A+" };
  if (score >= 90) return { posture: "OPTIMAL", letter: "A" };
  if (score >= 80) return { posture: "DEGRADED", letter: "B" };
  if (score >= 70) return { posture: "DEGRADED", letter: "C" };
  if (score >= 60) return { posture: "AT_RISK", letter: "D" };
  return { posture: "AT_RISK", letter: "F" };
}

function reviewNote(violation: FirewallViolation): string {
  if (isSecurityCategory(violation.category)) {
    return "No verified auto-commit is stored for this file. The patch stays in review until a TypeScript-checked heal lands on the branch.";
  }
  return "Architecture findings are not committed by the webhook heal loop. Apply the recommended patch on the branch.";
}

export function buildIntegrityMetrics(
  report: FirewallReport | null,
  history: readonly HealingAuditEntry[]
): IntegrityMetrics {
  const violations = report?.violations ?? [];
  const healed = history.filter((entry) => entry.category === "leaks" && entry.outcome === "healed").length;
  const openExposures = violations.length;
  const securityOpen = violations.filter((violation) => isSecurityCategory(violation.category)).length;
  const healDenom = healed + securityOpen;
  const healRate = healDenom === 0 ? null : Math.round((100 * healed) / healDenom);
  const scoreDenom = healed + openExposures;
  const score =
    report === null && history.length === 0
      ? null
      : scoreDenom === 0
        ? 100
        : Math.round((100 * healed) / scoreDenom);
  const posture = integrityPosture(score);

  const boundaries: BoundaryMetric[] = SECURITY_BOUNDARIES.map((id) => {
    const flagged = violations.filter((violation) => violationCategory(violation) === id).length;
    return {
      id,
      severity: BOUNDARY_SEVERITY[id],
      intercepted: flagged,
      healed: 0,
      flagged,
      status: flagged === 0 ? "SECURE" : "ACTION_REQUIRED",
    };
  });

  const queue: ReviewFinding[] = violations.map((violation, index) => ({
    id: `${violation.filePath}:${violation.line}:${index}`,
    severity: violation.severity,
    category: violationCategory(violation),
    filePath: violation.filePath,
    line: violation.line,
    fixStatus: "FLAGGED_FOR_REVIEW",
    summary: violation.message.replace(/\s+/g, " ").trim(),
    diff: violation.remediation?.diff ?? null,
    note: reviewNote(violation),
  }));

  return {
    score,
    posture: posture.posture,
    letter: posture.letter,
    statusText:
      score === null ? "awaiting first scan" : openExposures === 0 ? "no open exposures" : `${openExposures} open`,
    healed,
    healRate,
    openExposures,
    latencyLabel: "—",
    boundaries,
    queue,
  };
}
