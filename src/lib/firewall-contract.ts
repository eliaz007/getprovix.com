export const FIREWALL_SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;

export type FirewallSeverity = (typeof FIREWALL_SEVERITIES)[number];

export const FIREWALL_CATEGORIES = [
  "SECRET_LEAK",
  "CLIENT_DB_EXPOSURE",
  "VULNERABLE_DEPENDENCY",
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
};

export function isSecurityCategory(
  value: string | undefined
): value is Exclude<FirewallCategory, "ARCHITECTURE"> {
  return value === "SECRET_LEAK" || value === "CLIENT_DB_EXPOSURE" || value === "VULNERABLE_DEPENDENCY";
}

export function violationCategory(violation: { category?: FirewallCategory }): FirewallCategory {
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
  violations: FirewallViolation[];
  largestFiles: FirewallLargestFile[];
};

export type FirewallTarget =
  | { kind: "local"; snapshot: "scripts/audit-report.json" }
  | { kind: "github"; repoUrl: string };

export type FirewallResponse = {
  ok: boolean;
  source: "local" | "github";
  status: "ready" | "empty" | "error";
  message: string | null;
  target: FirewallTarget | null;
  report: FirewallReport | null;
};

/** Future scan body for this same endpoint once the legacy auditor is retired. */
export type FirewallScanRequest = {
  source?: "local" | "github";
  repoUrl?: string;
  githubUrl?: string;
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
};
