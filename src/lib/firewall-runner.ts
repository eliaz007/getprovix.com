import {
  isProvixScoredViolation,
  violationCategory,
  type FirewallReport,
  type FirewallViolation,
} from "@/lib/firewall-contract";

export type RunnerState = "OK" | "FAILED";
export type RunnerStatus = "PASSED" | "FAILED";

export type RunnerCheck = {
  id: string;
  label: string;
  state: RunnerState;
  detail: string;
};

function firstPath(violations: readonly FirewallViolation[]): string {
  return violations[0]?.filePath ?? "violation";
}

/**
 * Runner status is derived only from Provix `violations`.
 * `pvimFindings` never participate — PVIM authorization/RLS rows must not fail BOUNDARY_CHECK.
 */
export function buildRunnerChecks(report: FirewallReport): RunnerCheck[] {
  const scored = report.violations.filter(isProvixScoredViolation);
  const architecture = scored.filter((violation) => violationCategory(violation) === "ARCHITECTURE");
  const secrets = scored.filter((violation) => violationCategory(violation) === "SECRET_LEAK");
  const clientDb = scored.filter((violation) => violationCategory(violation) === "CLIENT_DB_EXPOSURE");
  const dependencies = scored.filter(
    (violation) => violationCategory(violation) === "VULNERABLE_DEPENDENCY"
  );
  const parsed = report.summary.totalFiles > 0;

  return [
    {
      id: "ast",
      label: "AST_PARSE",
      state: parsed ? "OK" : "FAILED",
      detail: parsed ? "tree accepted" : "no source files",
    },
    {
      id: "boundary",
      label: "BOUNDARY_CHECK",
      state: architecture.length === 0 ? "OK" : "FAILED",
      detail: architecture.length === 0 ? "boundaries held" : firstPath(architecture),
    },
    {
      id: "secret",
      label: "SECRET_SCAN",
      state: secrets.length === 0 ? "OK" : "FAILED",
      detail: secrets.length === 0 ? "no hardcoded keys" : firstPath(secrets),
    },
    {
      id: "immutable",
      label: "IMMUTABLE_CHECK",
      state: clientDb.length === 0 ? "OK" : "FAILED",
      detail: clientDb.length === 0 ? "server boundary sealed" : firstPath(clientDb),
    },
    {
      id: "deps",
      label: "DEPENDENCY_FLOOR",
      state: dependencies.length === 0 ? "OK" : "FAILED",
      detail: dependencies.length === 0 ? "package.json held" : firstPath(dependencies),
    },
  ];
}

export function runnerStatus(checks: readonly Pick<RunnerCheck, "state">[]): RunnerStatus {
  return checks.every((check) => check.state === "OK") ? "PASSED" : "FAILED";
}
