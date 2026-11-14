export const FIREWALL_SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;

export type FirewallSeverity = (typeof FIREWALL_SEVERITIES)[number];

export const FIREWALL_CATEGORIES = [
  "SECRET_LEAK",
  "CLIENT_DB_EXPOSURE",
  "VULNERABLE_DEPENDENCY",
  "INSECURE_AUTH_SESSION",
  "ARCHITECTURE",
] as const;

export type FirewallCategory = (typeof FIREWALL_CATEGORIES)[number];

export type FirewallRemediation = {
  diff: string;
  command?: string;
  envExample?: string;
};

export type FirewallViolation = {
  filePath: string;
  severity: FirewallSeverity;
  rule: string;
  message: string;
  line: number;
  category?: FirewallCategory;
  snippet?: string;
  remediation?: FirewallRemediation;
  /**
   * True only after the scan ran the same TypeScript preflight Fix with PR uses.
   * False or missing means manual review — do not show the button.
   */
  autofixable?: boolean;
  /**
   * Provenance. Omit or `"provix"` for Provix detector rows.
   * `"pvim"` must never be placed in `FirewallReport.violations` — use `pvimFindings`.
   */
  source?: "provix" | "pvim";
};

/** PVIM shadow analysis lifecycle for a single firewall scan. */
export const FIREWALL_PVIM_ANALYSIS_STATUSES = [
  "absent",
  "ok",
  "incomplete",
  "unavailable",
  "error",
  "timeout",
] as const;

export type FirewallPvimAnalysisStatus = (typeof FIREWALL_PVIM_ANALYSIS_STATUSES)[number];

export type FirewallPvimAnalysis = {
  status: FirewallPvimAnalysisStatus;
  engineVersion?: string;
  jobId?: string;
  findingCount: number;
  incomplete: number;
  elapsedMs: number;
  message?: string;
};

/** Non-authoritative PVIM reasoning lifecycle (display only). */
export const FIREWALL_PVIM_REASONING_STATUSES = [
  "skipped",
  "present",
  "unavailable",
  "invalid",
] as const;

export type FirewallPvimReasoningStatus = (typeof FIREWALL_PVIM_REASONING_STATUSES)[number];

/**
 * Bounded advisory reasoning from PVIM. Never authorizes remediation and must
 * never be merged into ``violations`` or scoring.
 */
export type FirewallPvimReasoning = {
  status: FirewallPvimReasoningStatus;
  detail: string;
  provider?: string | null;
  caseId?: string | null;
  caseSelection?: string | null;
  stopReason?: string | null;
  error?: string | null;
  hasCriticalReliabilityFlags: boolean;
  criticalReliabilityFlags: string[];
  /** Plain-text notes extracted when status is ``present``. */
  notes?: string | null;
  openQuestions?: string[];
  answerBlurbs?: string[];
};

/** Explicit remediation decision for a PVIM finding (Phase 2 adapter codes). */
export type FirewallPvimRemediationCode =
  | "unsupported_label"
  | "unsupported_rule"
  | "not_confirmed"
  | "missing_location"
  | "path_not_repo_relative"
  | "server_side_only"
  | "invalid_commit_sha"
  | "scanner_does_not_agree";

export type FirewallPvimRemediationStatus =
  | {
      kind: "supported";
      category: Exclude<FirewallCategory, "ARCHITECTURE" | "VULNERABLE_DEPENDENCY">;
      requiresScannerAgreement: true;
    }
  | {
      kind: "unsupported";
      code: FirewallPvimRemediationCode;
      reason: string;
    }
  | {
      /** Analysis recorded the finding; adapter has not run yet. */
      kind: "pending";
    };

/**
 * PVIM finding kept out of `violations` so Provix category/runner scoring
 * cannot invent ARCHITECTURE from an authorization or RLS label.
 */
export type FirewallPvimFinding = {
  findingId: string;
  /** Always `"pvim"` — distinguishes from Provix `FirewallViolation` rows. */
  source: "pvim";
  /**
   * Original PVIM detector (`m1` | `m2`). Required to rebuild the shadow finding
   * for the Fix-with-PR API; never invent this from Provix categories.
   */
  engineSource?: "m1" | "m2";
  label: string;
  ruleId: string;
  confidence: string;
  family?: string | null;
  filePath: string | null;
  line: number | null;
  message?: string;
  snippet?: string;
  remediation?: FirewallPvimRemediationStatus;
};

export function isSecurityCategory(
  value: string | undefined
): value is Exclude<FirewallCategory, "ARCHITECTURE"> {
  return (
    value === "SECRET_LEAK" ||
    value === "CLIENT_DB_EXPOSURE" ||
    value === "VULNERABLE_DEPENDENCY" ||
    value === "INSECURE_AUTH_SESSION"
  );
}

/** True for Provix detector rows that participate in runner / architecture scoring. */
export function isProvixScoredViolation(violation: {
  source?: "provix" | "pvim";
}): boolean {
  return violation.source !== "pvim";
}

/**
 * Category for Provix scoring and UI.
 * PVIM-sourced rows must never default into ARCHITECTURE — keep them in `pvimFindings`.
 */
export function violationCategory(violation: {
  category?: FirewallCategory;
  source?: "provix" | "pvim";
}): FirewallCategory {
  if (violation.source === "pvim") {
    if (isSecurityCategory(violation.category)) return violation.category;
    throw new TypeError(
      "violationCategory refuses to classify PVIM findings as ARCHITECTURE; keep them in pvimFindings."
    );
  }
  return isSecurityCategory(violation.category) ? violation.category : "ARCHITECTURE";
}

export type FirewallSummary = {
  totalFiles: number;
  totalLines: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
};

export type FirewallLargestFile = {
  filePath: string;
  lineCount: number;
};

export type FirewallReport = {
  timestamp: string;
  architectureScore: number;
  summary: FirewallSummary;
  /** Provix detector findings only. Never merge PVIM rows here. */
  violations: FirewallViolation[];
  largestFiles: FirewallLargestFile[];
  /**
   * Exact GitHub commit whose tree was scanned. Present for GitHub scans;
   * omitted for local snapshot reports.
   */
  commitSha?: string;
  /** PVIM shadow analysis summary. Omit when PVIM was not invoked. */
  pvim?: FirewallPvimAnalysis;
  /** PVIM findings kept separate from Provix `violations`. */
  pvimFindings?: FirewallPvimFinding[];
  /**
   * Optional non-authoritative PVIM reasoning. Omit when absent.
   * Display-only — never feeds scoring or Fix-with-PR.
   */
  pvimReasoning?: FirewallPvimReasoning;
};

export type FirewallTarget =
  | { kind: "local"; snapshot: "scripts/audit-report.json" }
  | { kind: "github"; repoUrl: string };

export type FirewallScanCoverage = {
  /** Source files actually reviewed. */
  scanned: number;
  /** Source files seen before the size cap. */
  total: number;
  /** GitHub's recursive tree was cut off, so `total` is a lower bound. */
  treeTruncated: boolean;
};

export type FirewallResponse = {
  ok: boolean;
  source: "local" | "github";
  status: "ready" | "empty" | "error";
  message: string | null;
  target: FirewallTarget | null;
  report: FirewallReport | null;
  coverage?: FirewallScanCoverage | null;
};

/** Future scan body for this same endpoint once the legacy auditor is retired. */
export type FirewallScanRequest = {
  source?: "local" | "github";
  repoUrl?: string;
  githubUrl?: string;
  /** Optional caller PAT. Used only for this request; never stored. */
  githubToken?: string;
};

export function isFirewallSeverity(value: string): value is FirewallSeverity {
  return (FIREWALL_SEVERITIES as readonly string[]).includes(value);
}

export type FirewallAutofixModule = {
  filePath: string;
  exportName: string;
  lineCount: number;
};

export type FirewallAutofixResponse = {
  ok: boolean;
  filePath?: string;
  summary?: string;
  diff?: string;
  modules?: FirewallAutofixModule[];
  canOpenPullRequest?: boolean;
  message?: string;
};

export type FirewallAutofixPullRequestResponse = {
  ok: boolean;
  message?: string;
  url?: string;
  number?: number;
  title?: string;
  branch?: string;
  base?: string;
  /** Present for PVIM adapter rejections (manual-review UI); never set on success. */
  code?: string;
};

export type FirewallResolvedPull = {
  filePath: string;
  number: number | null;
  url: string | null;
};

export type FirewallResolvedFilesResponse = {
  ok: boolean;
  filePaths: string[];
  pulls?: FirewallResolvedPull[];
  message?: string;
  /** False when Provix cannot open PRs on this repo (App not installed / no write token). */
  canOpenPullRequest?: boolean;
  accessMessage?: string;
};
