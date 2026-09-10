import { clampScore0to100 } from "@/lib/score-scale";
import {
  isSmokeOrE2eTestPath,
  isTestConfigPath,
  type RepoFilesystemEvidence,
  type ScoreCapAudit,
} from "@/lib/repo-filesystem";

export type ReadinessBadge = {
  label: string;
  className: string;
  meterClassName: string;
};

export type ChecklistTone = "pass" | "warn" | "fail";

export type ExecutiveChecklistItem = {
  id: "ci" | "error_handling" | "tests" | "commit_cadence";
  label: string;
  status: string;
  tone: ChecklistTone;
};

export function getReadinessBadge(score: number): ReadinessBadge {
  const clamped = clampScore0to100(score);

  if (clamped >= 85) {
    return {
      label: "Production-Ready Senior",
      className: "text-emerald-300 bg-emerald-500/10 border-emerald-500/30",
      meterClassName: "text-emerald-400",
    };
  }

  if (clamped >= 60) {
    return {
      label: "Competent / Intermediate",
      className: "text-amber-300 bg-amber-500/10 border-amber-500/30",
      meterClassName: "text-amber-400",
    };
  }

  return {
      label: "Needs Production Hardening",
      className: "text-rose-300 bg-rose-500/10 border-rose-500/30",
      meterClassName: "text-rose-400",
  };
}

export function normalizeCommitDates(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && item.toLowerCase() !== "unknown");
}

function coreArtifactFlags(
  scoreCap?: ScoreCapAudit | null,
  filesystem?: RepoFilesystemEvidence | null
): { tests: boolean; ci: boolean; error_handling: boolean } {
  if (filesystem) {
    return {
      tests: filesystem.test_paths.length > 0,
      ci: filesystem.ci_workflow_paths.length > 0,
      error_handling: filesystem.error_handling_paths.length > 0,
    };
  }

  return {
    tests: Boolean(scoreCap?.coreArtifacts.tests),
    ci: Boolean(scoreCap?.coreArtifacts.ci),
    error_handling: Boolean(scoreCap?.coreArtifacts.error_handling),
  };
}

export function classifyTestSuites(
  testsPresent: boolean,
  filesystem?: RepoFilesystemEvidence | null
): { status: string; tone: ChecklistTone } {
  if (!filesystem) {
    return testsPresent
      ? { status: "Full coverage", tone: "pass" }
      : { status: "No tests", tone: "fail" };
  }

  const paths = filesystem.test_paths;
  if (!testsPresent && paths.length === 0) {
    return { status: "No tests", tone: "fail" };
  }

  const substantive = paths.filter(
    (path) => !isTestConfigPath(path) && !isSmokeOrE2eTestPath(path)
  );

  if (substantive.length >= 3) {
    return { status: "Full coverage", tone: "pass" };
  }

  return { status: "Minimal (Smoke only)", tone: "warn" };
}

export function classifyCommitCadence(
  commitDates: string[] | null | undefined
): { status: string; tone: ChecklistTone } {
  const parsed = (commitDates ?? [])
    .map((value) => Date.parse(value))
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);

  if (parsed.length < 3) {
    return { status: "Clustered / Shallow", tone: "warn" };
  }

  const uniqueDays = new Set(
    parsed.map((value) => new Date(value).toISOString().slice(0, 10))
  );

  if (uniqueDays.size < 2) {
    return { status: "Clustered / Shallow", tone: "warn" };
  }

  const spanMs = parsed[parsed.length - 1] - parsed[0];
  const clusterWindowMs = 36 * 60 * 60 * 1000;
  let clusteredCount = 0;

  for (let start = 0; start < parsed.length; start += 1) {
    let end = start;
    while (end + 1 < parsed.length && parsed[end + 1] - parsed[start] <= clusterWindowMs) {
      end += 1;
    }
    clusteredCount = Math.max(clusteredCount, end - start + 1);
  }

  if (spanMs < clusterWindowMs || clusteredCount / parsed.length >= 0.7) {
    return { status: "Clustered / Shallow", tone: "warn" };
  }

  return { status: "Verified Human", tone: "pass" };
}

export function buildExecutiveChecklist(input: {
  scoreCap?: ScoreCapAudit | null;
  filesystem?: RepoFilesystemEvidence | null;
  commitDates?: string[] | null;
}): ExecutiveChecklistItem[] {
  const artifacts = coreArtifactFlags(input.scoreCap, input.filesystem);
  const tests = classifyTestSuites(artifacts.tests, input.filesystem);
  const cadence = classifyCommitCadence(input.commitDates);

  return [
    {
      id: "ci",
      label: "CI/CD Pipelines",
      status: artifacts.ci ? "Configured" : "None detected",
      tone: artifacts.ci ? "pass" : "fail",
    },
    {
      id: "error_handling",
      label: "Error Handling",
      status: artifacts.error_handling ? "Standardized" : "Missing boundaries",
      tone: artifacts.error_handling ? "pass" : "fail",
    },
    {
      id: "tests",
      label: "Test Suites",
      status: tests.status,
      tone: tests.tone,
    },
    {
      id: "commit_cadence",
      label: "Commit Cadence",
      status: cadence.status,
      tone: cadence.tone,
    },
  ];
}
