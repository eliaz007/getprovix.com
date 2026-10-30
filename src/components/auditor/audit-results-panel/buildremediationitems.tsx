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
import type { RemediationItem } from "./remediationitem";
import { remediationPointsFor } from "./remediationpointsfor";

export function buildRemediationItems(result: AuditResult): RemediationItem[] {
  try {
    const artifacts = result?.scoreCap?.coreArtifacts ?? {
      ci: (result?.filesystem?.ci_workflow_paths?.length ?? 0) > 0,
      tests: (result?.filesystem?.test_paths?.length ?? 0) > 0,
      error_handling:
        (result?.filesystem?.error_handling_paths?.length ?? 0) > 0,
    };

    const items: RemediationItem[] = [];

    if (!artifacts.ci) {
      const points = remediationPointsFor(result, "ci");
      items.push({
        id: "ci",
        label: `Add GitHub Actions CI/CD (+${points} pts)`,
        points,
        drawer: {
          filePath: ".github/workflows/ci.yml",
          directions:
            "Add this minimal GitHub Actions workflow to your repository root to run builds and automated validation on push and pull requests.",
          language: "yaml",
          content: CI_WORKFLOW_TEMPLATE,
        },
      });
    }

    if (!artifacts.tests) {
      const points = remediationPointsFor(result, "tests");
      items.push({
        id: "tests",
        label: `Add basic test suite (+${points} pts)`,
        points,
        drawer: {
          filePath: "src/__tests__/smoke.test.ts",
          directions:
            "Install Vitest (`npm i -D vitest`) and add this baseline smoke test to verify application environment initialization.",
          language: "typescript",
          content: SMOKE_TEST_TEMPLATE,
        },
      });
    }

    if (!artifacts.error_handling) {
      const points = remediationPointsFor(result, "error_handling");
      const isWebApp = result?.metrics?.evidence?.repoKind === "web_app";
      items.push({
        id: "error_handling",
        label: isWebApp
          ? `Add error boundaries (+${points} pts)`
          : `Add structured error handling (+${points} pts)`,
        points,
      });
    }

    return items;
  } catch (error) {
    console.error("Remediation item derive failed:", error);
    return [];
  }
}
