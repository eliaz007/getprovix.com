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

export function scoreDomain(scores: number[]): { min: number; max: number } {
  if (scores.length === 0) {
    return { min: 0, max: 100 };
  }

  const low = Math.min(...scores);
  const high = Math.max(...scores);
  const pad = Math.max(8, Math.round((high - low) * 0.25));
  let min = Math.max(0, Math.floor((low - pad) / 5) * 5);
  let max = Math.min(100, Math.ceil((high + pad) / 5) * 5);
  if (max - min < 20) {
    min = Math.max(0, min - 10);
    max = Math.min(100, max + 10);
  }
  return { min, max };
}
