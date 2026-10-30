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

export async function loadVerifiedRepoUrl(
  userId: string,
  fallbackUrl: string
): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("repo_verifications")
    .select("repo_url")
    .eq("user_id", userId)
    .eq("is_verified", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error && !isSupabaseSchemaError(error)) {
    console.error("[score-trend] verified repo lookup failed:", error.message);
  }

  if (typeof data?.repo_url === "string" && data.repo_url.trim()) {
    return data.repo_url.trim();
  }

  return fallbackUrl;
}
