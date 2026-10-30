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

export function yTicks(min: number, max: number): number[] {
  const span = Math.max(1, max - min);
  const step = span <= 20 ? 5 : span <= 40 ? 10 : 25;
  const start = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let value = start; value <= max; value += step) {
    ticks.push(value);
  }
  if (!ticks.includes(min)) {
    ticks.unshift(min);
  }
  if (!ticks.includes(max)) {
    ticks.push(max);
  }
  return ticks;
}
