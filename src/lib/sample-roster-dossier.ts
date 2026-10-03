import type { AuditCheck } from "@/lib/audit-checks";
import { emptyProductionAuditMetrics } from "@/lib/production-audit-metrics";
import { emptyRepoFilesystemEvidence } from "@/lib/repo-filesystem";

/** Static fixture for the marketing Sample Dossier Preview (no API calls). */
export function buildSampleRosterMemoProps() {
  const metrics = emptyProductionAuditMetrics();
  metrics.productionScore = 79;
  metrics.architecture = 86;
  metrics.testing = 78;
  metrics.devops = 80;
  metrics.resilience = 74;
  metrics.evidence.inspected = true;
  metrics.evidence.fileCount = 186;
  metrics.evidence.testFileCount = 18;
  metrics.evidence.ciWorkflowCount = 1;

  const filesystem = emptyRepoFilesystemEvidence();
  filesystem.inspected = true;
  filesystem.repo_kind = "web_app";
  filesystem.file_count = 186;
  filesystem.audited_commit_sha = "c0ffee1234ab5678def90123";
  filesystem.sample_paths = [
    "src/app/layout.tsx",
    "src/app/api/billing/route.ts",
    "src/lib/payments.ts",
  ];
  filesystem.architecture_paths = ["src/app/layout.tsx", "src/app/page.tsx"];
  filesystem.error_handling_paths = ["src/app/error.tsx"];
  filesystem.ci_workflow_paths = [".github/workflows/ci.yml"];
  filesystem.ci_has_tests = true;
  filesystem.ci_has_build = true;
  filesystem.unit_test_file_count = 18;
  filesystem.test_paths = [
    "src/lib/payments.test.ts",
    "src/app/api/billing/route.test.ts",
  ];
  filesystem.resilience_sampled = true;
  filesystem.unhandled_async_count = 2;
  filesystem.architecture_signals = {
    ...filesystem.architecture_signals,
    has_structure: true,
    has_typed_source: true,
    has_type_config: true,
    has_framework_config: true,
  };

  return {
    handle: "provix/sample-founder-build",
    targetStack: "Full-Stack Next.js",
    verifiedOn: "Sep 28, 2026",
    commitSha: filesystem.audited_commit_sha,
    score: 79,
    benchmark: { topPercentile: 12, totalAudits: 48 },
    metrics,
    filesystem,
    checks: [] as AuditCheck[],
    redFlags: [] as string[],
  };
}
