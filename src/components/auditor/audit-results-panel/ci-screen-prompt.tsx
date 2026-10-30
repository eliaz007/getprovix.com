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
import type { ScreenPrompt } from "./screenprompt";

export const CI_SCREEN_PROMPT: ScreenPrompt = {
  id: "ci",
  flagLabel: "Missing CI/CD",
  deduction: "−25 pts",
  label: "Architecture & Deployment Discipline",
  question:
    "I noticed this codebase deploys without an automated CI/CD pipeline. Walk me through how you prevent breaking production migrations or lint errors across a distributed team.",
  listenFor:
    "Look for familiarity with pre-commit hooks, trunk-based vs. GitFlow branching strategies, staging environments, or linting discipline.",
};
