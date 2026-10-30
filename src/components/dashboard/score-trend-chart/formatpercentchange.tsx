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

export function formatPercentChange(first: number, latest: number): {
  label: string;
  tone: "up" | "down" | "flat";
} {
  if (first <= 0) {
    const delta = latest - first;
    if (delta === 0) {
      return { label: "0% since first audit", tone: "flat" };
    }
    return {
      label: `${delta > 0 ? "+" : ""}${delta} pts since first audit`,
      tone: delta > 0 ? "up" : "down",
    };
  }

  const percent = ((latest - first) / first) * 100;
  if (Math.abs(percent) < 0.05) {
    return { label: "0% since first audit", tone: "flat" };
  }

  const abs = Math.abs(percent);
  const rounded = abs >= 10 ? abs.toFixed(0) : abs.toFixed(1);
  return {
    label: `${percent > 0 ? "+" : "−"}${rounded}% since first audit`,
    tone: percent > 0 ? "up" : "down",
  };
}
