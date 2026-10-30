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
import { HISTORY_LIMIT } from "./history-limit";
import { historyToTrendPoint } from "./historytotrendpoint";

export async function loadAuditHistory(userId: string): Promise<TrendPoint[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("production_audit_history")
    .select(
      "id, production_score, audited_repo_url, audited_at, created_at, ci_cd_score, test_density, error_handling"
    )
    .eq("user_id", userId)
    .order("audited_at", { ascending: true })
    .limit(HISTORY_LIMIT);

  if (error) {
    if (!isSupabaseSchemaError(error)) {
      console.error("[score-trend] history lookup failed:", error.message);
    }
    return [];
  }

  return (data ?? [])
    .map((row) => parseProductionAuditHistoryRow(row as Record<string, unknown>))
    .filter((entry): entry is ProductionAuditHistoryEntry => Boolean(entry))
    .map(historyToTrendPoint);
}
