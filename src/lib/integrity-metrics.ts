import {
  isSecurityCategory,
  violationCategory,
  type FirewallPvimFinding,
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

/** Enterprise Security Posture Index tiers (no school letter grades). */
export type SecurityPostureTier =
  | "VERIFIED"
  | "HARDENED"
  | "ELEVATED_RISK"
  | "CRITICAL_EXPOSURE";

/** @deprecated Use SecurityPostureTier — kept as an alias for older call sites. */
export type IntegrityPosture = SecurityPostureTier;

export type ReviewFixStatus = "FIX_READY" | "OPEN";

export type BoundaryMetric = {
  id: SecurityBoundary;
  /**
   * Highest severity among currently open findings for this boundary.
   * When `open === 0`, this is the catalog max severity for the boundary type.
   */
  severity: FirewallSeverity | "HIGH / MEDIUM";
  /** True when `severity` is the catalog max because nothing is open. */
  severityIsCatalogMax: boolean;
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

export type PostureDimensionId = "auth_secrets" | "data_boundaries" | "architecture";

export type PostureDimensionScore = {
  id: PostureDimensionId;
  label: string;
  /** Weight in the composite index (sums to 1). */
  weight: number;
  /** Dimension score 0–100 after diminishing deductions. */
  score: number;
};

export type IntegrityMetrics = {
  /** Composite Security Posture Index 0–100 (null before first scan). */
  score: number | null;
  /** Uncapped weighted index before the critical severity ceiling. */
  uncappedScore: number | null;
  tier: SecurityPostureTier | null;
  tierLabel: string;
  /** Accent token for UI: emerald | purple | amber | red. */
  tierAccent: "emerald" | "purple" | "amber" | "red" | "neutral";
  /** Present when >= 1 open Critical security finding forced the 69 ceiling. */
  capReason: string | null;
  /** e.g. "Resolving 2 critical findings raises index to 88 (Hardened)". */
  projectionLine: string | null;
  dimensions: readonly PostureDimensionScore[];
  statusText: string;
  critical: number;
  high: number;
  medium: number;
  low: number;
  fixPullRequests: number;
  /** Provix security + PVIM open count (Security tab universe). */
  openExposures: number;
  /** Structure / ARCHITECTURE open count (same as Audits Structure card). */
  structureCount: number;
  /** openExposures + structureCount — matches posture projection totals. */
  totalOpenFindings: number;
  boundaries: BoundaryMetric[];
  queue: ReviewFinding[];
};

const SEVERITY_RANK: Record<FirewallSeverity, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

/** Per-finding hit inside a dimension (diminishes with recurrence). */
const SEVERITY_HIT: Record<FirewallSeverity, number> = {
  CRITICAL: 24,
  HIGH: 14,
  MEDIUM: 7,
  LOW: 3,
};

/** Geometric decay so the 2nd/3rd finding of a type hurts less than the first. */
const DIMENSION_DECAY = 0.62;

const CRITICAL_SCORE_CAP = 69;

const AUTH_SECRET_CATEGORIES = new Set(["SECRET_LEAK", "INSECURE_AUTH_SESSION", "VULNERABLE_DEPENDENCY"]);
const DATA_BOUNDARY_CATEGORIES = new Set(["CLIENT_DB_EXPOSURE"]);

const BOUNDARY_SEVERITY: Record<SecurityBoundary, BoundaryMetric["severity"]> = {
  CLIENT_DB_EXPOSURE: "CRITICAL",
  SECRET_LEAK: "CRITICAL",
  VULNERABLE_DEPENDENCY: "HIGH / MEDIUM",
  INSECURE_AUTH_SESSION: "HIGH",
};

const DIMENSION_META: readonly {
  id: PostureDimensionId;
  label: string;
  weight: number;
}[] = [
  { id: "auth_secrets", label: "Auth & Secrets", weight: 0.5 },
  { id: "data_boundaries", label: "Data Boundaries", weight: 0.3 },
  { id: "architecture", label: "Architecture", weight: 0.2 },
];

type ScoredFinding = { severity: FirewallSeverity };

export function securityPostureTier(score: number | null): {
  tier: SecurityPostureTier | null;
  tierLabel: string;
  tierAccent: IntegrityMetrics["tierAccent"];
} {
  if (score === null) {
    return { tier: null, tierLabel: "—", tierAccent: "neutral" };
  }
  if (score >= 90) {
    return { tier: "VERIFIED", tierLabel: "Verified", tierAccent: "emerald" };
  }
  if (score >= 75) {
    return { tier: "HARDENED", tierLabel: "Hardened", tierAccent: "purple" };
  }
  if (score >= 50) {
    return { tier: "ELEVATED_RISK", tierLabel: "Elevated Risk", tierAccent: "amber" };
  }
  return {
    tier: "CRITICAL_EXPOSURE",
    tierLabel: "Critical Exposure",
    tierAccent: "red",
  };
}

/** @deprecated Prefer securityPostureTier — letter grades are retired. */
export function integrityPosture(score: number | null): {
  posture: SecurityPostureTier | null;
  letter: string;
} {
  const mapped = securityPostureTier(score);
  return { posture: mapped.tier, letter: mapped.tierLabel };
}

/**
 * Diminishing per-finding deductions inside one dimension.
 * First CRITICAL ≈ −24, second ≈ −15, third ≈ −9, …
 */
export function scorePostureDimension(findings: readonly ScoredFinding[]): number {
  if (findings.length === 0) return 100;
  const sorted = [...findings].sort(
    (left, right) => SEVERITY_RANK[left.severity] - SEVERITY_RANK[right.severity]
  );
  let penalty = 0;
  for (let index = 0; index < sorted.length; index += 1) {
    const finding = sorted[index]!;
    penalty += SEVERITY_HIT[finding.severity] * Math.pow(DIMENSION_DECAY, index);
  }
  return Math.max(0, Math.min(100, Math.round(100 - penalty)));
}

function pvimAsFinding(_finding: FirewallPvimFinding): ScoredFinding {
  // Shadow findings lack Provix severity — treat as HIGH for Data Boundaries.
  return { severity: "HIGH" };
}

function partitionFindings(report: FirewallReport | null | undefined): {
  auth: ScoredFinding[];
  data: ScoredFinding[];
  architecture: ScoredFinding[];
  criticalSecurity: FirewallViolation[];
} {
  const auth: ScoredFinding[] = [];
  const data: ScoredFinding[] = [];
  const architecture: ScoredFinding[] = [];
  const criticalSecurity: FirewallViolation[] = [];

  for (const violation of listOpenSecuritySnapshotFindings(report)) {
    if (violation.severity === "CRITICAL") criticalSecurity.push(violation);
    const category = violationCategory(violation);
    if (AUTH_SECRET_CATEGORIES.has(category)) {
      auth.push({ severity: violation.severity });
    } else if (DATA_BOUNDARY_CATEGORIES.has(category)) {
      data.push({ severity: violation.severity });
    } else if (isSecurityCategory(violation.category)) {
      // Future security categories default into Auth & Secrets.
      auth.push({ severity: violation.severity });
    }
  }

  for (const finding of listOpenPvimSnapshotFindings(report)) {
    data.push(pvimAsFinding(finding));
  }

  for (const violation of listOpenStructureSnapshotFindings(report)) {
    architecture.push({ severity: violation.severity });
  }

  return { auth, data, architecture, criticalSecurity };
}

function buildDimensions(parts: {
  auth: ScoredFinding[];
  data: ScoredFinding[];
  architecture: ScoredFinding[];
}): PostureDimensionScore[] {
  const byId: Record<PostureDimensionId, ScoredFinding[]> = {
    auth_secrets: parts.auth,
    data_boundaries: parts.data,
    architecture: parts.architecture,
  };
  return DIMENSION_META.map((meta) => ({
    id: meta.id,
    label: meta.label,
    weight: meta.weight,
    score: scorePostureDimension(byId[meta.id]),
  }));
}

function weightedComposite(dimensions: readonly PostureDimensionScore[]): number {
  const raw = dimensions.reduce((sum, dimension) => sum + dimension.score * dimension.weight, 0);
  return Math.max(0, Math.min(100, Math.round(raw)));
}

export type SecurityPostureIndex = {
  score: number;
  uncappedScore: number;
  tier: SecurityPostureTier;
  tierLabel: string;
  tierAccent: IntegrityMetrics["tierAccent"];
  capReason: string | null;
  projectionLine: string | null;
  dimensions: PostureDimensionScore[];
  criticalCount: number;
};

/**
 * Pure 0–100 Security Posture Index for a scan snapshot.
 * Applies the hard Critical ceiling (max 69) when any Critical security finding is open.
 */
export function computeSecurityPostureIndex(
  report: FirewallReport | null | undefined
): SecurityPostureIndex | null {
  if (!report) return null;

  const parts = partitionFindings(report);
  const dimensions = buildDimensions(parts);
  const uncappedScore = weightedComposite(dimensions);
  const criticalCount = parts.criticalSecurity.length;
  const capped = criticalCount >= 1;
  const score = capped ? Math.min(uncappedScore, CRITICAL_SCORE_CAP) : uncappedScore;
  const tierInfo = securityPostureTier(score);
  const capReason = capped
    ? criticalCount === 1
      ? `Capped at ${CRITICAL_SCORE_CAP} until 1 critical finding is resolved`
      : `Capped at ${CRITICAL_SCORE_CAP} until ${criticalCount} critical findings are resolved`
    : null;

  let projectionLine: string | null = null;
  if (criticalCount >= 1) {
    // Recompute as if Critical Provix security findings were cleared.
    const withoutCriticals: typeof parts = {
      auth: parts.auth.filter((item) => item.severity !== "CRITICAL"),
      data: parts.data.filter((item) => item.severity !== "CRITICAL"),
      // Architecture criticals do not drive the security cap, but clearing
      // Critical security findings is what the projection promises.
      architecture: parts.architecture,
    };
    // Also drop Critical data-boundary hits that came from Provix CRITICAL rows.
    const projectedDimensions = buildDimensions(withoutCriticals);
    const projectedScore = weightedComposite(projectedDimensions);
    const projectedTier = securityPostureTier(projectedScore);
    projectionLine = `Resolving ${criticalCount} critical finding${
      criticalCount === 1 ? "" : "s"
    } raises index to ${projectedScore} (${projectedTier.tierLabel})`;
  } else {
    const openTotal =
      parts.auth.length + parts.data.length + parts.architecture.length;
    if (openTotal > 0 && uncappedScore < 100) {
      projectionLine = `Resolving ${openTotal} open finding${
        openTotal === 1 ? "" : "s"
      } raises index to 100 (Verified)`;
    }
  }

  return {
    score,
    uncappedScore,
    tier: tierInfo.tier!,
    tierLabel: tierInfo.tierLabel,
    tierAccent: tierInfo.tierAccent,
    capReason,
    projectionLine,
    dimensions,
    criticalCount,
  };
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

/**
 * Open Security findings from the latest scan snapshot.
 * Counts every Provix security-category violation (not Structure / ARCHITECTURE).
 * Canonical Security universe for Overview, Audits, sidebar, and Security filter pills
 * (before session dismiss / PR-opened filters).
 */
export function listOpenSecuritySnapshotFindings(
  report: FirewallReport | null | undefined
): FirewallViolation[] {
  if (!report) return [];
  return report.violations.filter((violation) => {
    if (violation.source === "pvim") return false;
    return isSecurityCategory(violation.category);
  });
}

/** Open Structure (ARCHITECTURE) findings from the same scan snapshot. */
export function listOpenStructureSnapshotFindings(
  report: FirewallReport | null | undefined
): FirewallViolation[] {
  if (!report) return [];
  return report.violations.filter(
    (violation) => violationCategory(violation) === "ARCHITECTURE"
  );
}

/**
 * Open PVIM shadow findings (excludes explicit "safe" rows).
 * Part of the same Security open universe as Provix security-category findings.
 */
export function listOpenPvimSnapshotFindings(
  report: FirewallReport | null | undefined
): NonNullable<FirewallReport["pvimFindings"]> {
  if (!report?.pvimFindings?.length) return [];
  return report.pvimFindings.filter(
    (finding) => finding.label.trim().toLowerCase() !== "safe"
  );
}

export function countOpenPvimSnapshotFindings(
  report: FirewallReport | null | undefined
): number {
  return listOpenPvimSnapshotFindings(report).length;
}

export type DashboardOpenSummary = {
  critical: number;
  high: number;
  other: number;
  /** Provix security + PVIM — sidebar badge, Overview pill, Security "All N". */
  openExposures: number;
  securityCount: number;
  pvimCount: number;
  /** Structure / ARCHITECTURE findings (Audits Structure card). */
  structureCount: number;
};

/**
 * Single normalized findings summary for Overview / Audits / Security / sidebar.
 * Every badge and "X critical · Y open" pill must read from this selector.
 */
export function buildOverviewOpenSummary(
  report: FirewallReport | null | undefined
): DashboardOpenSummary {
  const openSecurity = listOpenSecuritySnapshotFindings(report);
  const pvimCount = countOpenPvimSnapshotFindings(report);
  const critical = countSeverity(openSecurity, "CRITICAL");
  const high = countSeverity(openSecurity, "HIGH");
  const securityCount = openSecurity.length;
  const other = Math.max(0, securityCount - critical - high) + pvimCount;
  return {
    critical,
    high,
    other,
    openExposures: securityCount + pvimCount,
    securityCount,
    pvimCount,
    structureCount: listOpenStructureSnapshotFindings(report).length,
  };
}

export function buildIntegrityMetrics(
  report: FirewallReport | null,
  history: readonly HealingAuditEntry[]
): IntegrityMetrics {
  const violations = report?.violations ?? [];
  const openSecurity = listOpenSecuritySnapshotFindings(report);
  const openSummary = buildOverviewOpenSummary(report);
  const critical = openSummary.critical;
  const high = openSummary.high;
  const medium = countSeverity(openSecurity, "MEDIUM");
  const low = countSeverity(openSecurity, "LOW");
  const openExposures = openSummary.openExposures;
  const index = computeSecurityPostureIndex(report);
  const fixPullRequests = history.filter((entry) => entry.outcome === "healed").length;

  const boundaries: BoundaryMetric[] = SECURITY_BOUNDARIES.map((id) => {
    const openRows = openSecurity.filter((violation) => violationCategory(violation) === id);
    const open = openRows.length;
    if (open === 0) {
      return {
        id,
        severity: BOUNDARY_SEVERITY[id],
        severityIsCatalogMax: true,
        open: 0,
        status: "CLEAR" as const,
      };
    }
    const highest = [...openRows].sort(
      (left, right) => SEVERITY_RANK[left.severity] - SEVERITY_RANK[right.severity]
    )[0]!;
    return {
      id,
      severity: highest.severity,
      severityIsCatalogMax: false,
      open,
      // Status must track the Open column — never CLEAR while open > 0.
      status: "OPEN" as const,
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

  const structureCount = openSummary.structureCount;
  const totalOpenFindings = openExposures + structureCount;
  const statusText =
    index === null
      ? "No scan yet"
      : totalOpenFindings === 0
        ? "Clean scan"
        : `${critical} critical · ${totalOpenFindings} open (${openExposures} security · ${structureCount} structure)`;

  return {
    score: index?.score ?? null,
    uncappedScore: index?.uncappedScore ?? null,
    tier: index?.tier ?? null,
    tierLabel: index?.tierLabel ?? "—",
    tierAccent: index?.tierAccent ?? "neutral",
    capReason: index?.capReason ?? null,
    projectionLine: index?.projectionLine ?? null,
    dimensions: index?.dimensions ?? DIMENSION_META.map((meta) => ({
      id: meta.id,
      label: meta.label,
      weight: meta.weight,
      score: 100,
    })),
    statusText,
    critical,
    high,
    medium,
    low,
    fixPullRequests,
    openExposures,
    structureCount,
    totalOpenFindings,
    boundaries,
    queue,
  };
}
