import { describe, expect, it } from "vitest";
import {
  PROVIX_AST_ENGINE,
  buildGitProvenance,
  buildHiringBattlePlanProbes,
  buildPillarSubLogs,
  buildSubsystemBlastRadius,
} from "@/lib/forensic-dossier";
import { emptyProductionAuditMetrics } from "@/lib/production-audit-metrics";
import { emptyRepoFilesystemEvidence } from "@/lib/repo-filesystem";

describe("forensic-dossier builders", () => {
  it("builds provenance with LOC estimate and AST engine", () => {
    const fs = emptyRepoFilesystemEvidence();
    fs.inspected = true;
    fs.file_count = 400;
    fs.executable_source_count = 100;
    fs.audited_branch = "main";
    fs.audited_commit_sha = "abcdef0123456789";

    const provenance = buildGitProvenance(fs);
    expect(provenance.inspectedFiles).toBe(400);
    expect(provenance.authoredLocEstimate).toBe(7200);
    expect(provenance.branch).toBe("main");
    expect(provenance.commitSha).toBe("abcdef0123456789");
    expect(provenance.astEngine).toBe(PROVIX_AST_ENGINE);
  });

  it("emits pillar receipts with two strengths and one deficit", () => {
    const metrics = emptyProductionAuditMetrics();
    metrics.architecture = 82;
    metrics.devops = 85;
    metrics.resilience = 65;
    metrics.testing = 19;
    const fs = emptyRepoFilesystemEvidence();
    fs.inspected = true;
    fs.file_count = 400;
    fs.test_paths = ["src/lib/foo.test.ts"];
    fs.unit_test_file_count = 1;
    fs.ci_workflow_paths = [".github/workflows/ci.yml"];
    fs.error_handling_paths = ["src/app/error.tsx"];
    fs.architecture_paths = ["src/app/layout.tsx"];

    const logs = buildPillarSubLogs({ metrics, filesystem: fs });
    expect(logs).toHaveLength(4);
    for (const log of logs) {
      expect(log.strengths).toHaveLength(2);
      expect(log.criticalDeficit.length).toBeGreaterThan(10);
      expect(log.summary.length).toBeGreaterThan(20);
      expect(log.summary).not.toMatch(/^\+|!/);
    }
    expect(logs.find((l) => l.pillar === "testing")?.score).toBe(19);
    expect(logs.find((l) => l.pillar === "testing")?.summary).toMatch(
      /test files/
    );
  });

  it("builds blast matrix for UI API DB Testing", () => {
    const metrics = emptyProductionAuditMetrics();
    metrics.testing = 19;
    metrics.resilience = 65;
    metrics.architecture = 82;
    const rows = buildSubsystemBlastRadius({
      metrics,
      filesystem: emptyRepoFilesystemEvidence(),
    });
    expect(rows.map((r) => r.subsystem)).toEqual([
      "UI",
      "API",
      "DB",
      "Testing",
    ]);
    expect(["P1", "P2", "P3"]).toContain(rows[3]!.riskLevel);
    expect(rows[3]!.evaluatedSeniority).toBe("Junior / Deficit");
  });

  it("returns two battle-plan probes biased to testing and resilience", () => {
    const metrics = emptyProductionAuditMetrics();
    metrics.testing = 19;
    metrics.resilience = 65;
    const probes = buildHiringBattlePlanProbes({
      metrics,
      filesystem: emptyRepoFilesystemEvidence(),
    });
    expect(probes).toHaveLength(2);
    expect(probes[0]).toMatch(/Testing is 19/);
    expect(probes[1]).toMatch(/Resilience is 65/);
  });
});
