import type { ProductionAuditMetrics } from "@/lib/production-audit-metrics";
import type { RepoFilesystemEvidence } from "@/lib/repo-filesystem";
import { clampScore0to100 } from "@/lib/score-scale";

export const PROVIX_AST_ENGINE = "provix-fs-ast/1.4.0" as const;

/** Mean LOC per executable source file — labeled estimate only. */
const LOC_PER_EXECUTABLE_FILE = 72;

export type GitProvenance = {
  inspectedFiles: number;
  authoredLocEstimate: number;
  branch: string;
  commitSha: string | null;
  astEngine: typeof PROVIX_AST_ENGINE;
};

export type PillarKey = "architecture" | "devops" | "resilience" | "testing";

export type PillarSubLog = {
  pillar: PillarKey;
  score: number;
  /** Single-sentence diagnostic for dense pillar cards. */
  summary: string;
  strengths: [string, string];
  criticalDeficit: string;
};

export type BlastSubsystem = "UI" | "API" | "DB" | "Testing";

export type BlastRiskLevel = "P1" | "P2" | "P3";

export type BlastRadiusRow = {
  subsystem: BlastSubsystem;
  evaluatedSeniority: string;
  riskLevel: BlastRiskLevel;
  forensicFinding: string;
};

function shortPath(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts.slice(-3).join("/") || path;
}

function allPaths(fs: RepoFilesystemEvidence | null): string[] {
  if (!fs) {
    return [];
  }
  return Array.from(
    new Set([
      ...fs.sample_paths,
      ...fs.architecture_paths,
      ...fs.test_paths,
      ...fs.ci_workflow_paths,
      ...fs.error_handling_paths,
    ])
  );
}

function isApiPath(path: string): boolean {
  return /(^|\/)(app\/api|pages\/api|api)\//i.test(path) || /(^|\/)route\.[cm]?[jt]sx?$/i.test(path);
}

function isDbPath(path: string): boolean {
  return /(^|\/)(prisma|supabase|drizzle|migrations?|schema\.prisma)(\/|$)/i.test(
    path
  );
}

function isTestPathLocal(path: string): boolean {
  return (
    /(^|\/)(__tests?__|tests?|spec|e2e|cypress|playwright)(\/|$)/i.test(path) ||
    /\.(tests?|spec|cy)\.[cm]?[jt]sx?$/i.test(path)
  );
}

function isUiPath(path: string): boolean {
  if (isApiPath(path) || isDbPath(path) || isTestPathLocal(path)) {
    return false;
  }
  return (
    /(^|\/)(components|app|pages|src\/components|src\/app|src\/pages)\//i.test(
      path
    ) || /\.(tsx|jsx|vue|svelte)$/i.test(path)
  );
}

function riskFromScore(score: number): BlastRiskLevel {
  if (score < 40) {
    return "P1";
  }
  if (score < 70) {
    return "P2";
  }
  return "P3";
}

function seniorityFromScore(score: number): string {
  if (score >= 80) {
    return "Mid-Level autonomous";
  }
  if (score >= 65) {
    return "Senior-supervised";
  }
  if (score >= 45) {
    return "Intern / Junior";
  }
  return "Junior / Deficit";
}

export function buildGitProvenance(
  filesystem: RepoFilesystemEvidence | null | undefined
): GitProvenance {
  const fs = filesystem ?? null;
  const executable = fs?.executable_source_count ?? 0;
  const branch = fs?.audited_branch?.trim() || "main";
  const sha = fs?.audited_commit_sha?.trim() || null;

  return {
    inspectedFiles: fs?.file_count ?? 0,
    authoredLocEstimate: executable * LOC_PER_EXECUTABLE_FILE,
    branch,
    commitSha: sha,
    astEngine: PROVIX_AST_ENGINE,
  };
}

function architectureSubLog(
  score: number,
  fs: RepoFilesystemEvidence | null
): PillarSubLog {
  const archPath = fs?.architecture_paths[0]
    ? shortPath(fs.architecture_paths[0])
    : null;
  const archCount = fs?.architecture_paths.length ?? 0;
  const sample = fs?.sample_paths.find((p) => /(^|\/)(src\/)?app\//i.test(p));
  const strengths: [string, string] = [
    archPath
      ? `Structure signal at ${archPath}`
      : fs?.repo_kind === "web_app"
        ? "Web-app layout signals detected in tree"
        : "Typed/modular path signals in inspected tree",
    sample
      ? `Route shell footprint at ${shortPath(sample)}`
      : `Inspected ${fs?.file_count ?? 0} paths for architecture footprint`,
  ];
  const criticalDeficit =
    archCount === 0
      ? "Critical deficit: no architecture path anchors (manifest/app shell) in inspected tree"
      : score < 60
        ? `Critical deficit: architecture ${score}/100 — shallow structure around ${archPath ?? "app shell"}`
        : `Watch: architecture ${score}/100 — deepen module boundaries beyond ${archPath ?? "root"}`;
  const summary =
    archCount === 0
      ? "No architecture path anchors in the inspected tree, so module boundaries remain unverified."
      : score >= 75
        ? `Solid structure signals across ${archCount} anchors${archPath ? ` (e.g. ${archPath})` : ""} support coherent feature ownership.`
        : `Architecture at ${score}/100 with ${archCount} path anchors${archPath ? ` near ${archPath}` : ""} still leaves module boundaries shallow.`;

  return { pillar: "architecture", score, summary, strengths, criticalDeficit };
}

function devopsSubLog(
  score: number,
  fs: RepoFilesystemEvidence | null
): PillarSubLog {
  const ci = fs?.ci_workflow_paths[0]
    ? shortPath(fs.ci_workflow_paths[0])
    : null;
  const strengths: [string, string] = [
    ci
      ? `CI workflow present at ${ci}`
      : "Repo tree inspected for workflow paths",
    fs?.ci_has_lint
      ? "Lint gate observed in sampled CI"
      : fs?.ci_has_build
        ? "Build step observed in sampled CI"
        : fs?.ci_depth && fs.ci_depth !== "none"
          ? `Pipeline depth tagged ${fs.ci_depth}`
          : "DevOps signals scored from file-tree inspection",
  ];
  const criticalDeficit = !ci
    ? "Critical deficit: no .github/workflows (or equivalent CI) inspected — release risk is manual"
    : fs?.ci_has_tests === false
      ? `Critical deficit: ${ci} lacks an automated test gate`
      : score < 60
        ? `Critical deficit: DevOps ${score}/100 — shallow pre-merge enforcement at ${ci}`
        : `Watch: harden deploy/typecheck gates beyond ${ci}`;
  const summary = !ci
    ? "No CI workflow inspected, so releases depend on manual gates and human memory."
    : fs?.ci_has_tests === false
      ? `Workflow at ${ci} runs without an automated test gate, so regressions can merge unchecked.`
      : score >= 75
        ? `CI at ${ci} enforces pre-merge checks consistent with DevOps ${score}/100.`
        : `DevOps at ${score}/100 around ${ci} still leaves pre-merge enforcement incomplete.`;

  return { pillar: "devops", score, summary, strengths, criticalDeficit };
}

function resilienceSubLog(
  score: number,
  fs: RepoFilesystemEvidence | null
): PillarSubLog {
  const boundary = fs?.error_handling_paths[0]
    ? shortPath(fs.error_handling_paths[0])
    : null;
  const unhandled = fs?.resilience_sampled ? fs.unhandled_async_count : null;
  const strengths: [string, string] = [
    boundary
      ? `Fault boundary at ${boundary}`
      : "Resilience sampled against async/error patterns",
    fs?.has_contract_boundaries
      ? "Route contract boundaries present on sampled handlers"
      : fs?.route_schema_validation
        ? "Runtime schema validation on sampled routes"
        : `Error-handling paths: ${fs?.error_handling_paths.length ?? 0}`,
  ];
  const criticalDeficit = !boundary
    ? "Critical deficit: no error.tsx / ErrorBoundary inspected — localized crashes can kill the shell"
    : unhandled !== null && unhandled > 0
      ? `Critical deficit: ${unhandled} inspected async/fetch calls lack hard timeouts/fallbacks`
      : score < 70
        ? `Critical deficit: resilience ${score}/100 around ${boundary} — degraded-network handling incomplete`
        : `Watch: extend timeout/fallback coverage beyond ${boundary}`;
  const summary = !boundary
    ? "No error boundary inspected, so a localized render failure can terminate the app shell."
    : unhandled !== null && unhandled > 0
      ? `${unhandled} inspected async/fetch calls near ${boundary} lack hard timeouts or explicit fallbacks.`
      : score >= 75
        ? `Fault containment at ${boundary} supports resilience ${score}/100 under degraded paths.`
        : `Resilience at ${score}/100 around ${boundary} still leaves degraded-network handling incomplete.`;

  return { pillar: "resilience", score, summary, strengths, criticalDeficit };
}

function testingSubLog(
  score: number,
  fs: RepoFilesystemEvidence | null
): PillarSubLog {
  const testCount =
    fs?.unit_test_file_count ?? fs?.test_paths.length ?? 0;
  const testPath = fs?.test_paths[0] ? shortPath(fs.test_paths[0]) : null;
  const files = fs?.file_count ?? 0;
  const strengths: [string, string] = [
    testPath
      ? `Verified test path at ${testPath}`
      : testCount > 0
        ? `${testCount} unit test files classified`
        : "Test bucket scanned in file tree",
    fs?.has_e2e_tools
      ? "E2E tooling paths present (Playwright/Cypress/etc.)"
      : `Test path count: ${fs?.test_paths.length ?? 0}`,
  ];
  const criticalDeficit =
    testCount === 0
      ? `Critical deficit: 0 test files across ${files} inspected paths — no regression lock`
      : score < 40
        ? `Critical deficit: testing ${score}/100 with ${testCount} files / ${files} paths — API contracts unprotected`
        : `Watch: deepen integration coverage beyond ${testPath ?? `${testCount} suites`}`;
  const sourceCount = fs?.executable_source_count || fs?.source_file_count || files;
  const summary =
    testCount === 0
      ? `0 test files across ${files} inspected paths leaves core logic fully exposed to regression.`
      : score < 50
        ? `${testCount} test files covering ${sourceCount} source files leaves core API logic vulnerable to regression.`
        : score >= 75
          ? `${testCount} test files against ${sourceCount} source files provide a credible regression lock.`
          : `${testCount} test files across ${sourceCount} source files are enough for feature work, not unsupervised ownership.`;

  return { pillar: "testing", score, summary, strengths, criticalDeficit };
}

export function buildPillarSubLogs(input: {
  metrics: ProductionAuditMetrics;
  filesystem: RepoFilesystemEvidence | null;
}): PillarSubLog[] {
  const { metrics, filesystem } = input;
  return [
    architectureSubLog(clampScore0to100(metrics.architecture), filesystem),
    devopsSubLog(clampScore0to100(metrics.devops), filesystem),
    resilienceSubLog(clampScore0to100(metrics.resilience), filesystem),
    testingSubLog(clampScore0to100(metrics.testing), filesystem),
  ];
}

export function buildSubsystemBlastRadius(input: {
  metrics: ProductionAuditMetrics;
  filesystem: RepoFilesystemEvidence | null;
}): BlastRadiusRow[] {
  const fs = input.filesystem;
  const paths = allPaths(fs);
  const uiCount = paths.filter(isUiPath).length;
  const apiCount = paths.filter(isApiPath).length;
  const dbCount = paths.filter(isDbPath).length;
  const testCount =
    fs?.unit_test_file_count ||
    fs?.test_paths.length ||
    paths.filter(isTestPathLocal).length;

  const arch = clampScore0to100(input.metrics.architecture);
  const testing = clampScore0to100(input.metrics.testing);
  const resilience = clampScore0to100(input.metrics.resilience);

  const apiScore = Math.round(
    (resilience * 0.45 + arch * 0.35 + testing * 0.2)
  );
  const uiScore = Math.round((arch * 0.55 + resilience * 0.45));
  const dbScore = Math.round(
    (arch * 0.4 + resilience * 0.4 + (fs?.has_contract_boundaries ? 75 : 35) * 0.2)
  );

  const apiFinding =
    fs?.route_schema_validation === false
      ? "Sampled API routes lack runtime schema validation on inputs"
      : apiCount === 0
        ? "No API/route handlers classified in inspected tree"
        : fs?.unvalidated_type_assertions && fs.unvalidated_type_assertions > 0
          ? `${fs.unvalidated_type_assertions} bare type assertions on sampled route handlers`
          : `API surface ~${apiCount} paths; resilience ${resilience}/100`;

  const uiFinding =
    (fs?.error_handling_paths.length ?? 0) === 0
      ? "Client shell missing inspected error boundary — UI crash blast radius unbounded"
      : uiCount > 0
        ? `UI surface ~${uiCount} paths; boundary at ${shortPath(fs!.error_handling_paths[0]!)}`
        : "Sparse UI path classification in sampled tree";

  const dbFinding =
    dbCount === 0
      ? "No prisma/supabase/drizzle paths classified — state layer opaque to audit"
      : `DB/state surface ~${dbCount} paths; contract boundaries ${
          fs?.has_contract_boundaries ? "present" : "weak"
        }`;

  const testFinding =
    testCount === 0
      ? `0 test files vs ${fs?.file_count ?? 0} inspected — regression blast radius is full-repo`
      : `Testing ${testing}/100 with ${testCount} files / ${fs?.file_count ?? 0} paths`;

  return [
    {
      subsystem: "UI",
      evaluatedSeniority: seniorityFromScore(uiScore),
      riskLevel: riskFromScore(uiScore),
      forensicFinding: uiFinding,
    },
    {
      subsystem: "API",
      evaluatedSeniority: seniorityFromScore(apiScore),
      riskLevel: riskFromScore(apiScore),
      forensicFinding: apiFinding,
    },
    {
      subsystem: "DB",
      evaluatedSeniority: seniorityFromScore(dbScore),
      riskLevel: riskFromScore(dbScore),
      forensicFinding: dbFinding,
    },
    {
      subsystem: "Testing",
      evaluatedSeniority: seniorityFromScore(testing),
      riskLevel: riskFromScore(testing),
      forensicFinding: testFinding,
    },
  ];
}

export function buildHiringBattlePlanProbes(input: {
  metrics: ProductionAuditMetrics;
  filesystem: RepoFilesystemEvidence | null;
}): [string, string] {
  const fs = input.filesystem;
  const testing = clampScore0to100(input.metrics.testing);
  const resilience = clampScore0to100(input.metrics.resilience);
  const testCount =
    fs?.unit_test_file_count ?? fs?.test_paths.length ?? 0;
  const files = fs?.file_count ?? 0;
  const testPath = fs?.test_paths[0] ? shortPath(fs.test_paths[0]) : null;
  const boundary = fs?.error_handling_paths[0]
    ? shortPath(fs.error_handling_paths[0])
    : null;
  const unhandled =
    fs?.resilience_sampled === true ? fs.unhandled_async_count : null;

  const testingProbe = `Testing is ${testing}/100 with ${testCount} verified files across ${files} inspected paths${
    testPath ? ` (e.g. ${testPath})` : ""
  }. Pick the highest-risk API mutation and write the characterization test that must fail before that contract regresses — what assertion proves the failure mode?`;

  const resilienceProbe =
    unhandled !== null && unhandled > 0
      ? `Resilience is ${resilience}/100 and ${unhandled} inspected async/fetch calls lack hard timeouts. Walk the call site to a typed fallback: where does the UI shell stay alive when the network degrades?`
      : boundary
        ? `Resilience is ${resilience}/100 around ${boundary}. How do you keep a failing client subtree from terminating the shared layout while still surfacing a typed error to the caller?`
        : `Resilience is ${resilience}/100 with no inspected error boundary. Design the route-level error.tsx / ErrorBoundary that isolates a hydration crash from the app shell — name the files you would add.`;

  if (testing <= resilience) {
    return [testingProbe, resilienceProbe];
  }
  return [resilienceProbe, testingProbe];
}
