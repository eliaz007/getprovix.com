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

export const AUDIT_STAGES = [
  "Artifact Analysis (Check 1)...",
  "Architecture Review (Check 2)...",
  "API & Data Resiliency Check (Check 3)...",
] as const;
