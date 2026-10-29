"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Check,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import type { AuditResult } from "@/app/api/audit/route";
import { normalizeAuditChecks } from "@/lib/audit-checks";
import { DAILY_LIMIT_UI_MESSAGE, type DailyScanUsage } from "@/lib/daily-scan-limit";
import { readJsonResponse } from "@/lib/read-json-response";
import {
  buildProductionAuditClaim,
  CLAIM_AUDIT_INTENT,
  cachePendingProductionAudit,
  clearPendingProductionAudit,
  formatAuditedRepoLabel,
  PRIVATE_AUDIT_INTENT,
  type ProductionAuditClaim,
} from "@/lib/production-audit";
import ScorecardPublicationCallout from "@/components/auditor/scorecard-publication-callout";
import RepoAccessStatus, {
  VerifiedContributorMark,
  type RepoAccessStatusKind,
} from "@/components/auditor/repo-access-status";
import ProductionScoreVerifiedBadge from "@/components/ProductionScoreVerifiedBadge";
import GuestAuthModal from "@/components/GuestAuthModal";
import { isFilesystemCapRedFlag } from "@/lib/repo-filesystem";
import {
  isInaccessiblePublicAudit,
  isInvalidRepoFormatResponse,
  isPrivateOrNotFoundAuditResponse,
  isUnverifiedOwnershipResponse,
  unverifiedOwnershipUsername,
} from "@/lib/inaccessible-public-audit";
import Toast from "@/components/Toast";
import { createClient } from "@/utils/supabase/client";
import {
  getGitHubUrlValidationMessage,
  hasUsableGitHubAuditTarget,
  isGitHubPlaceholderInput,
} from "@/lib/validate-github-url";

export function SubMetric({ label, score }: { label: string; score: number }) {
  return (
    <div className="rounded-lg border border-border bg-background px-2.5 py-2 text-center">
      <p className="font-mono text-sm font-bold tabular-nums text-textMain">
        {score}
      </p>
      <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-textMuted">
        {label}
      </p>
    </div>
  );
}
