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
import { FindingList } from "./findinglist";

export function FindingsSection({
  strengths,
  gaps,
  fixes,
}: {
  strengths: string[];
  gaps: string[];
  fixes: string[];
}) {
  const groups = [
    { title: "Verified strengths", items: strengths, tone: "pass" as const },
    {
      title: "Gaps and missing proof-of-work",
      items: gaps,
      tone: "warn" as const,
    },
    { title: "Actionable fixes", items: fixes, tone: "fix" as const },
  ];

  return (
    <section className="rounded-2xl border border-neutral-800/80 bg-[#0d0f17] p-5">
      <h3 className="text-sm font-bold tracking-tight text-textMain">
        Findings
      </h3>
      <div className="mt-3 space-y-4">
        {groups.map((group: (typeof groups)[number]) => (
          <FindingList
            key={group.title}
            title={group.title}
            items={group.items}
            tone={group.tone}
          />
        ))}
      </div>
    </section>
  );
}
