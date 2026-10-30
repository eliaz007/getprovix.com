"use client";
import {
  Component,
  useEffect,
  useMemo,
  useState,
  type ErrorInfo,
  type ReactNode,
} from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Copy,
  FileDown,
  Lock,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react";
import type { AuditResult } from "@/app/api/audit/route";
import AuditChecksList from "@/components/auditor/audit-checks-list";
import CopyShareLinkButton from "@/components/auditor/copy-share-link-button";
import TechnicalEvaluationMemo from "@/components/auditor/technical-evaluation-memo";
import ProductionScorecard from "@/components/auditor/production-scorecard";
import GitProvenanceBar from "@/components/auditor/git-provenance-bar";
import SubsystemBlastRadiusMatrix from "@/components/auditor/subsystem-blast-radius-matrix";
import HiringInterviewBattlePlan from "@/components/auditor/hiring-interview-battle-plan";
import ScoreCapBreakdown from "@/components/auditor/score-cap-breakdown";
import ScoreMeter from "@/components/ScoreMeter";
import {
  buildGitProvenance,
  buildHiringBattlePlanProbes,
  buildPillarSubLogs,
  buildSubsystemBlastRadius,
} from "@/lib/forensic-dossier";
import {
  buildExecutiveChecklist,
  CODE_HEALTH_VERIFIED_THRESHOLD,
  DELIVERY_HYGIENE_VERIFIED_THRESHOLD,
  getReadinessBadge,
  HISTORY_BLOCKS_QUALIFY_NOTE,
  isHistoryGateMet,
  isProductionReadyAudit,
  PRODUCTION_READY_VERIFIED,
  resolveDisplayedReadinessScore,
  type ChecklistTone,
  type ExecutiveChecklistItem,
} from "@/lib/audit-readiness";
import { formatCommitHistoryReason } from "@/lib/commit-history-score";
import { isEmployerRole } from "@/lib/dashboard-account";
import {
  emptyProductionAuditMetrics,
  resolveCodeHealthScore,
  resolveDeliveryHygieneScore,
  resolveProductionAuditMetrics,
  type ProductionAuditMetrics,
} from "@/lib/production-audit-metrics";
import { isFilesystemCapRedFlag } from "@/lib/repo-filesystem";
import { clampScore0to100 } from "@/lib/score-scale";
import { CI_WORKFLOW_TEMPLATE } from "./ci-workflow-template";
import { SMOKE_TEST_TEMPLATE } from "./smoke-test-template";
import type { ActionableFix } from "./actionablefix";
import { remediationPointsFor } from "./remediationpointsfor";

export function buildActionableFixes(result: AuditResult): ActionableFix[] {
  try {
    const artifacts = result?.scoreCap?.coreArtifacts ?? {
      ci: (result?.filesystem?.ci_workflow_paths?.length ?? 0) > 0,
      tests: (result?.filesystem?.test_paths?.length ?? 0) > 0,
      error_handling:
        (result?.filesystem?.error_handling_paths?.length ?? 0) > 0,
    };
    const metrics = resolveProductionAuditMetrics({
      metrics: result?.metrics,
      filesystem: result?.filesystem ?? null,
      auditMode: result?.auditMode,
      history: {
        commitDates: result?.commitDates ?? null,
        commitStats: result?.commitStats ?? null,
      },
    });
    const testingScore = clampScore0to100(metrics.testing);
    const devopsScore = clampScore0to100(metrics.devops);
    const codeHealth = resolveCodeHealthScore(metrics);

    const fixes: ActionableFix[] = [];

    if (
      isProductionReadyAudit({
        productionScore: codeHealth,
        architecture: metrics.architecture,
        testing: testingScore,
        devops: devopsScore,
        resilience: metrics.resilience,
      })
    ) {
      return [
        {
          id: "production_ready",
          title: "Production-ready",
          deductionLabel: "",
          summary: PRODUCTION_READY_VERIFIED,
        },
      ];
    }

    if (!artifacts.ci) {
      const points = remediationPointsFor(result, "ci");
      fixes.push({
        id: "ci",
        title: "Missing CI/CD pipeline",
        deductionLabel: `−${points} pts`,
        summary:
          "No `.github/workflows/*.yml` detected. Shipping a GitHub Actions workflow restores the DevOps pillar.",
        template: {
          filename: ".github/workflows/ci.yml",
          language: "yaml",
          directions:
            "Add this minimal GitHub Actions workflow to your repository root to run builds and automated validation on push and pull requests.",
          content: CI_WORKFLOW_TEMPLATE,
        },
      });
    } else if (devopsScore < 85) {
      fixes.push({
        id: "ci_depth",
        title: "CI/CD needs stronger PR automation",
        deductionLabel: `${devopsScore}/100`,
        summary:
          "Configure automated test runs and build validations on pull requests in GitHub Actions.",
      });
    }

    if (!artifacts.tests) {
      const points = remediationPointsFor(result, "tests");
      fixes.push({
        id: "tests",
        title: "Missing test suite",
        deductionLabel: `−${points} pts`,
        summary:
          "No test files or runner config found. A minimal smoke suite unblocks the tests pillar and proves regression coverage exists.",
        template: {
          filename: "src/__tests__/smoke.test.ts",
          language: "typescript",
          directions:
            "Install Vitest (`npm i -D vitest`) and add this baseline smoke test to verify application environment initialization.",
          content: SMOKE_TEST_TEMPLATE,
        },
      });
    } else if (testingScore < 75) {
      fixes.push({
        id: "tests_coverage",
        title: "Expand test coverage",
        deductionLabel: `${testingScore}/100`,
        summary: `Expand unit and integration test coverage across critical routes and utility functions (currently scored at ${testingScore}/100).`,
      });
    }

    if (!artifacts.error_handling) {
      const points = remediationPointsFor(result, "error_handling");
      const isWebApp = result?.metrics?.evidence?.repoKind === "web_app";
      fixes.push({
        id: "error_handling",
        title: isWebApp
          ? "Missing error boundaries"
          : "Missing structured error handling",
        deductionLabel: `−${points} pts`,
        summary: isWebApp
          ? "No `error.tsx` / ErrorBoundary modules detected. That deducts 35 from the resilience pillar (not a drop to 0). Add an App Router `error.tsx` or a React error boundary; wrap remaining fetch/await calls in try/catch."
          : "No try/catch modules or error-handler files detected. Resilience starts at 100 and only falls for unhandled async/fetch (15 points each, max 50). React error boundaries are not required for libraries or backend packages.",
      });
    }

    return fixes;
  } catch (error) {
    console.error("Actionable fix derive failed:", error);
    return [];
  }
}
