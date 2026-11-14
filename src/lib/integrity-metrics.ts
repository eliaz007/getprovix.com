import {
  isSecurityCategory,
  violationCategory,
  type FirewallReport,
  type FirewallSeverity,
  type FirewallViolation,
} from "@/lib/firewall-contract";
import {
  isActionableArchitectureViolation,
  isActionableSecurityFinding,
} from "@/lib/firewall-autofix";
import type { HealingAuditEntry } from "@/lib/healing-audit";

export const SECURITY_BOUNDARIES = [
  "CLIENT_DB_EXPOSURE",
  "SECRET_LEAK",
  "VULNERABLE_DEPENDENCY",
  "INSECURE_AUTH_SESSION",
] as const;
export type SecurityBoundary = (typeof SECURITY_BOUNDARIES)[number];

export type IntegrityPosture = "OPTIMAL" | "DEGRADED" | "AT_RISK";
export type ReviewFixStatus = "FIX_READY" | "OPEN";

export type BoundaryMetric = {
  id: SecurityBoundary;
  severity: "CRITICAL" | "HIGH" | "HIGH / MEDIUM";
  open: number;
  status: "CLEAR" | "OPEN";
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
  critical: number;
  high: number;
  medium: number;
  low: number;
  fixPullRequests: number;
  openExposures: number;
  boundaries: BoundaryMetric[];
  queue: ReviewFinding[];
};

const SEVERITY_PENALTY: Record<FirewallSeverity, number> = {
  CRITICAL: 25,
  HIGH: 12,
  MEDIUM: 5,
  LOW: 2,
};

const SEVERITY_RANK: Record<FirewallSeverity, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

const BOUNDARY_SEVERITY: Record<SecurityBoundary, BoundaryMetric["severity"]> = {
  CLIENT_DB_EXPOSURE: "CRITICAL",
  SECRET_LEAK: "CRITICAL",
  VULNERABLE_DEPENDENCY: "HIGH / MEDIUM",
  INSECURE_AUTH_SESSION: "HIGH",
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

function reviewNote(violation: FirewallViolation, fixStatus: ReviewFixStatus): string {
  if (fixStatus === "FIX_READY" && isSecurityCategory(violation.category)) {
    return "Fix with PR can open a patch for this finding. The pull request is not merged until you review it.";
  }
  if (fixStatus === "FIX_READY") {
    return "Fix with PR can split this file or wrap unhandled calls. A typecheck runs before the pull request opens.";
  }
  return "This finding is open. Provix does not open a pull request for it.";
}

function findingStatus(violation: FirewallViolation): ReviewFixStatus {
  if (isSecurityCategory(violation.category)) {
    return isActionableSecurityFinding(violation) ? "FIX_READY" : "OPEN";
  }
  return isActionableArchitectureViolation({
    filePath: violation.filePath,
    rule: violation.rule,
    autofixable: violation.autofixable,
  })
    ? "FIX_READY"
    : "OPEN";
}

function countSeverity(violations: readonly FirewallViolation[], severity: FirewallSeverity): number {
  return violations.filter((violation) => violation.severity === severity).length;
}

export function buildIntegrityMetrics(
  report: FirewallReport | null,
  history: readonly HealingAuditEntry[]
): IntegrityMetrics {
  const violations = report?.violations ?? [];
  const critical = countSeverity(violations, "CRITICAL");
  const high = countSeverity(violations, "HIGH");
  const medium = countSeverity(violations, "MEDIUM");
  const low = countSeverity(violations, "LOW");
  const openExposures = violations.length;
  const penalty = violations.reduce((sum, violation) => sum + SEVERITY_PENALTY[violation.severity], 0);
  const score = report === null ? null : Math.max(0, 100 - penalty);
  const posture = integrityPosture(score);
  const fixPullRequests = history.filter((entry) => entry.outcome === "healed").length;

  const boundaries: BoundaryMetric[] = SECURITY_BOUNDARIES.map((id) => {
    const open = violations.filter((violation) => violationCategory(violation) === id).length;
    return {
      id,
      severity: BOUNDARY_SEVERITY[id],
      open,
      status: open === 0 ? "CLEAR" : "OPEN",
    };
  });

  // Review queue = heal queue. Only findings Fix with PR can open.
  const queue: ReviewFinding[] = violations
    .map((violation, index) => {
      const fixStatus = findingStatus(violation);
      return {
        id: `${violation.filePath}:${violation.line}:${index}`,
        severity: violation.severity,
        category: violationCategory(violation),
        filePath: violation.filePath,
        line: violation.line,
        fixStatus,
        summary: violation.message.replace(/\s+/g, " ").trim(),
        diff: violation.remediation?.diff ?? null,
        note: reviewNote(violation, fixStatus),
      };
    })
    .filter((finding) => finding.fixStatus === "FIX_READY")
    .sort(
      (left, right) =>
        SEVERITY_RANK[left.severity] - SEVERITY_RANK[right.severity] ||
        left.filePath.localeCompare(right.filePath) ||
        left.line - right.line
    );

  return {
    score,
    posture: posture.posture,
    letter: posture.letter,
    statusText:
      score === null
        ? "No scan yet"
        : openExposures === 0
          ? "Clean scan"
          : `${critical} critical · ${openExposures} open`,
    critical,
    high,
    medium,
    low,
    fixPullRequests,
    openExposures,
    boundaries,
    queue,
  };
}
