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

export function FindingList({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: "pass" | "warn" | "fix";
}) {
  if (items.length === 0) {
    return null;
  }

  const iconClass =
    tone === "pass"
      ? "text-emerald-400"
      : tone === "warn"
        ? "text-violet-400"
        : "text-neutral-400";

  return (
    <div>
      <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-textMuted">
        {title}
      </p>
      <ul className="space-y-2">
        {items.map((item: (typeof items)[number]) => (
          <li
            key={item}
            className="flex items-start gap-2 text-sm leading-relaxed text-textMuted"
          >
            {tone === "pass" ? (
              <Check className={`mt-0.5 h-4 w-4 shrink-0 ${iconClass}`} aria-hidden />
            ) : (
              <AlertTriangle
                className={`mt-0.5 h-4 w-4 shrink-0 ${iconClass}`}
                aria-hidden
              />
            )}
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
