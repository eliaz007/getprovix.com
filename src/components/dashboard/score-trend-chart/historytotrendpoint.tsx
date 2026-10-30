"use client";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { Loader2, Minus, TrendingDown, TrendingUp } from "lucide-react";
import { assignAuditTier, deriveDualModeScores } from "@/lib/audit-mode";
import { cn } from "@/lib/cn";
import {
  formatAuditedAt,
  formatAuditedRepoLabel,
  parseProductionAuditHistoryRow,
  PRODUCTION_AUDIT_UPDATED_EVENT,
  type ProductionAuditHistoryEntry,
} from "@/lib/production-audit";
import { isSupabaseSchemaError } from "@/lib/supabase-schema-errors";
import { parseGitHubUrl } from "@/lib/validate-github-url";
import { createClient } from "@/utils/supabase/client";
import type { TrendPoint } from "./trendpoint";

export function historyToTrendPoint(entry: ProductionAuditHistoryEntry): TrendPoint {
  return {
    id: entry.id,
    contractScore: entry.contractScore,
    fullTimeScore: entry.fullTimeScore,
    at: entry.auditedAt || entry.createdAt,
    repoUrl: entry.auditedRepoUrl,
    commitSha: entry.commitSha,
  };
}
