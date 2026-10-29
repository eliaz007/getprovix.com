"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { Check, Loader2, ShieldCheck, Sparkles } from "lucide-react";
import type { AuditResult } from "@/app/api/audit/route";
// Alternative/external project artifacts are disabled — GitHub URL only.
// import ExternalProjectsForm from "@/components/portfolio/external-projects-form";
import AuditResultsPanel from "@/components/auditor/audit-results-panel";
import RepoOwnershipVerifier from "@/components/auditor/repo-ownership-verifier";
import RepoAccessStatus, {
  VerifiedContributorMark,
  type RepoAccessStatusKind,
} from "@/components/auditor/repo-access-status";
import { normalizeAuditChecks } from "@/lib/audit-checks";
import { readJsonResponse } from "@/lib/read-json-response";
import {
  buildProductionAuditClaim,
  cachePendingProductionAudit,
  clearPendingProductionAudit,
  notifyProductionAuditUpdated,
  parseDossierVerificationStatus,
  PRIVATE_AUDITED_REPO_LABEL,
  // PRIVATE_AUDIT_INTENT,
  productionAuditRecordFromClaim,
  type ProductionAuditRecord,
} from "@/lib/production-audit";
import {
  isInvalidRepoFormatResponse,
  isPrivateOrNotFoundAuditResponse,
  isUnverifiedOwnershipResponse,
  unverifiedOwnershipUsername,
} from "@/lib/inaccessible-public-audit";
import Toast from "@/components/Toast";
import Button from "@/components/ui/Button";
import FormLabel from "@/components/ui/FormLabel";
import PageHeader from "@/components/ui/PageHeader";
import {
  canBypassProvixTokenChallenge,
  canonicalGitHubRepoUrl,
  hasPersistedProvixTokenVerification,
} from "@/lib/provix-token";
import { createClient } from "@/utils/supabase/client";
// Alternative/external project artifacts are disabled — GitHub URL only.
// import {
//   hasUsableExternalProjects,
//   type ExternalProjectRecord,
// } from "@/lib/external-projects";
import {
  getGitHubUrlValidationMessage,
  hasUsableGitHubAuditTarget,
  isGitHubPlaceholderInput,
  parseGitHubRepoPath,
  parseGitHubUrl,
} from "@/lib/validate-github-url";
import {
  DAILY_LIMIT_UI_MESSAGE,
  type DailyScanUsage,
} from "@/lib/daily-scan-limit";
import {
  AUDIT_MODE_OPTIONS,
  DEFAULT_AUDIT_MODE,
  type AuditMode,
} from "@/lib/audit-mode";

export const GLASS_CARD =
  "bg-[#131316]/90 border border-white/[0.08] backdrop-blur-xl rounded-xl shadow-2xl p-6 sm:p-7";
