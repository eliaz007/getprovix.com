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
import type { RampUpStatus } from "./rampupstatus";

export function getRampUpStatus(score: number): RampUpStatus {
  const clamped = clampScore0to100(score);

  if (clamped >= 85) {
    return {
      label: "INDEPENDENT CONTRIBUTOR (0 Wk Ramp-Up)",
      briefLabel: "Independent contributor (0 wk ramp-up)",
      className:
        "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
    };
  }

  if (clamped >= 70) {
    return {
      label: "LIGHT ONBOARDING (1-2 Wk Ramp-Up)",
      briefLabel: "Light onboarding (1–2 wk ramp-up)",
      className: "border-sky-500/40 bg-amber-500/10 text-amber-300",
    };
  }

  return {
    label: "RAMP-UP: SUPERVISION REQUIRED (3-4 Wk Ramp-Up)",
    briefLabel: "Supervision required (3–4 wk ramp-up)",
    className: "border-rose-500/40 bg-rose-500/10 text-rose-400",
  };
}
