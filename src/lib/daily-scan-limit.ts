import type { SupabaseClient } from "@supabase/supabase-js";

export const DAILY_SCAN_LIMIT = 10;

export const DAILY_LIMIT_API_MESSAGE =
  "Daily limit reached (10/10). Resets at midnight.";

export const DAILY_LIMIT_UI_MESSAGE =
  "Daily limit reached (10/10). Resets tomorrow.";

export type DailyScanUsage = {
  daily_scans: number;
  last_scan_date: string | null;
  limit_reached: boolean;
  remaining: number;
};

function todayUtcDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function normalizeScanDate(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length >= 10 ? trimmed.slice(0, 10) : null;
}

export function resolveDailyScanUsage(
  dailyScans: number | null | undefined,
  lastScanDate: string | null | undefined,
  today = todayUtcDate()
): DailyScanUsage {
  const storedDate = normalizeScanDate(lastScanDate);
  const isSameDay = storedDate === today;
  const parsedCount =
    typeof dailyScans === "number" && Number.isFinite(dailyScans)
      ? Math.round(dailyScans)
      : 0;
  const count = isSameDay ? Math.max(0, parsedCount) : 0;
  const remaining = Math.max(0, DAILY_SCAN_LIMIT - count);

  return {
    daily_scans: count,
    last_scan_date: storedDate,
    limit_reached: count >= DAILY_SCAN_LIMIT,
    remaining,
  };
}

export async function loadDailyScanUsage(
  supabase: SupabaseClient,
  userId: string
): Promise<{ usage: DailyScanUsage; error: string | null }> {
  const { data, error } = await supabase
    .from("profiles")
    .select("daily_scans, last_scan_date")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    return {
      usage: resolveDailyScanUsage(0, null),
      error: error.message,
    };
  }

  return {
    usage: resolveDailyScanUsage(data?.daily_scans, data?.last_scan_date),
    error: null,
  };
}

export async function incrementDailyScanUsage(
  supabase: SupabaseClient,
  userId: string,
  current: DailyScanUsage
): Promise<DailyScanUsage> {
  const today = todayUtcDate();
  const nextCount = current.daily_scans + 1;

  const { error } = await supabase
    .from("profiles")
    .update({
      daily_scans: nextCount,
      last_scan_date: today,
    })
    .eq("id", userId);

  if (error) {
    console.error("[daily-scan-limit] increment failed:", error);
    return current;
  }

  return resolveDailyScanUsage(nextCount, today, today);
}
