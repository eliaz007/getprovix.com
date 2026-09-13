"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import ProductionScoreVerifiedBadge from "@/components/ProductionScoreVerifiedBadge";
import { fetchWithAuth } from "@/lib/fetch-with-auth";
import { readJsonResponse } from "@/lib/read-json-response";
import { createClient } from "@/utils/supabase/client";
import {
  canPublishProductionScore,
  formatAuditedAt,
  formatAuditedRepoLabel,
  isPrivateAuditedRepoLabel,
  parseProductionAuditHistoryRow,
  PUBLIC_SCORECARD_THRESHOLD,
  type ProductionAuditHistoryEntry,
  type ProductionAuditRecord,
} from "@/lib/production-audit";

const SIGNED_IN_AUDITOR_PATH = "/dashboard/auditor";
const PUBLIC_AUDITOR_PATH = "/audits";

async function persistOwnScoreVisibility(nextVisible: boolean): Promise<void> {
  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error("Sign in to change employer visibility.");
  }

  const payload: Record<string, boolean> = {
    is_publicly_visible: nextVisible,
  };
  if (nextVisible) {
    payload.is_visible_in_pool = true;
  }

  let { data, error } = await supabase
    .from("profiles")
    .update(payload)
    .or(`id.eq.${user.id},user_id.eq.${user.id}`)
    .select("id, is_publicly_visible")
    .maybeSingle();

  if (error && nextVisible && /is_visible_in_pool/i.test(error.message)) {
    const retry = await supabase
      .from("profiles")
      .update({ is_publicly_visible: nextVisible })
      .or(`id.eq.${user.id},user_id.eq.${user.id}`)
      .select("id, is_publicly_visible")
      .maybeSingle();
    data = retry.data;
    error = retry.error;
  }

  if (!error && data) {
    return;
  }

  const response = await fetchWithAuth("/api/profile/production-audit", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ is_publicly_visible: nextVisible }),
  });

  let apiError = error?.message ?? "Could not update visibility.";
  try {
    const body = await readJsonResponse<{ error?: string }>(response);
    if (response.ok) {
      return;
    }
    if (body.error?.trim()) {
      apiError = body.error.trim();
    }
  } catch {
    if (!response.ok) {
      apiError = "Could not update visibility.";
    }
  }

  throw new Error(apiError);
}

function useEmployerScoreVisibility(
  record: ProductionAuditRecord | null,
  onVisibilityChange?: (visible: boolean) => void
) {
  const hasScore = Boolean(record?.isAuditVerified);
  const score = record?.productionScore ?? 0;
  const canPublish = canPublishProductionScore(score);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visibilityOverride, setVisibilityOverride] = useState<boolean | null>(
    null
  );
  const recordVisibility = Boolean(record?.isPubliclyVisible);
  const visible = visibilityOverride ?? recordVisibility;
  const visibilitySourceKey = `${record?.productionScore ?? "none"}:${recordVisibility}:${record?.breakdown.audited_at ?? ""}`;
  const [syncedVisibilityKey, setSyncedVisibilityKey] =
    useState(visibilitySourceKey);

  if (syncedVisibilityKey !== visibilitySourceKey) {
    setSyncedVisibilityKey(visibilitySourceKey);
    setVisibilityOverride(null);
  }

  const toggleVisibility = async () => {
    if (!hasScore || !canPublish || saving) {
      return;
    }

    const previousVisible = visible;
    const nextVisible = !visible;
    setVisibilityOverride(nextVisible);
    onVisibilityChange?.(nextVisible);
    setSaving(true);
    setError(null);

    try {
      await persistOwnScoreVisibility(nextVisible);
    } catch (err) {
      setVisibilityOverride(previousVisible);
      onVisibilityChange?.(previousVisible);
      setError(
        err instanceof Error ? err.message : "Could not update visibility."
      );
    } finally {
      setSaving(false);
    }
  };

  return {
    hasScore,
    score,
    canPublish,
    visible,
    saving,
    error,
    toggleVisibility,
  };
}

function EmployerVisibilitySwitch({
  checked,
  disabled,
  saving,
  onToggle,
}: {
  checked: boolean;
  disabled: boolean;
  saving: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label="Show verified score to employers"
      disabled={disabled || saving}
      onClick={onToggle}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
        saving
          ? "cursor-wait opacity-60"
          : disabled
            ? "cursor-not-allowed opacity-50"
            : "cursor-pointer"
      } ${checked ? "bg-emerald-500" : "bg-background"}`}
    >
      <span
        className="absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform"
        style={{
          transform: checked ? "translateX(16px)" : "translateX(0)",
        }}
      />
    </button>
  );
}

const NO_AUDIT_BADGE_CLASS =
  "border-border bg-background text-textMuted";

export function AuditStatusBanner({
  record,
  onVisibilityChange,
}: {
  record: ProductionAuditRecord | null;
  onVisibilityChange?: (visible: boolean) => void;
}) {
  const { hasScore, score, canPublish, visible, saving, error, toggleVisibility } =
    useEmployerScoreVisibility(record, onVisibilityChange);

  return (
    <div className="rounded-xl border border-border bg-panel px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <p className="font-mono text-sm font-bold tabular-nums text-textMain">
            {hasScore ? score : "—"}
            <span className="ml-0.5 text-[10px] font-semibold text-textMuted">
              /100
            </span>
          </p>
          {hasScore ? <ProductionScoreVerifiedBadge score={score} /> : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-[10px] font-medium text-textMuted">Employers</span>
          <EmployerVisibilitySwitch
            checked={visible && canPublish}
            disabled={!canPublish}
            saving={saving}
            onToggle={() => void toggleVisibility()}
          />
        </div>
      </div>
      {error ? (
        <p className="mt-1 text-[10px] text-red-300" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function MetricPill({ label, score }: { label: string; score: number }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[10px] leading-none text-textMuted">
      {label}
      <span className="font-mono font-medium tabular-nums text-textMain">
        {score}
      </span>
    </span>
  );
}

function AuditHistoryList({
  entries,
  loading,
}: {
  entries: ProductionAuditHistoryEntry[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <p className="text-[11px] text-textMuted">Loading history…</p>
    );
  }

  if (entries.length === 0) {
    return null;
  }

  return (
    <details className="group">
      <summary className="cursor-pointer list-none text-[11px] text-textMuted hover:text-textMain [&::-webkit-details-marker]:hidden">
        <span className="group-open:hidden">History · {entries.length}</span>
        <span className="hidden group-open:inline">Hide history</span>
      </summary>
      <ul className="mt-1.5 max-h-28 space-y-0.5 overflow-y-auto">
        {entries.map((entry) => {
          const repo = formatAuditedRepoLabel(entry.auditedRepoUrl);
          const when = formatAuditedAt(entry.auditedAt || entry.createdAt);
          return (
            <li
              key={entry.id}
              className="flex items-center justify-between gap-3 py-1 text-[11px]"
            >
              <p className="min-w-0 truncate text-textMuted">
                <span className="text-textMain">{repo}</span>
                {when ? ` · ${when}` : ""}
              </p>
              <p className="shrink-0 font-mono tabular-nums text-textMain">
                {entry.productionScore}
              </p>
            </li>
          );
        })}
      </ul>
    </details>
  );
}

export default function VerifiedCodeQualityScorecard({
  record,
  onVisibilityChange,
  compact = true,
}: {
  record: ProductionAuditRecord | null;
  onVisibilityChange?: (visible: boolean) => void;
  compact?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const alreadyOnAuditor =
    pathname === SIGNED_IN_AUDITOR_PATH ||
    pathname === PUBLIC_AUDITOR_PATH ||
    pathname.startsWith(`${SIGNED_IN_AUDITOR_PATH}/`);
  const { hasScore, score, canPublish, visible, saving, error, toggleVisibility } =
    useEmployerScoreVisibility(record, onVisibilityChange);
  const repo = record?.breakdown.audited_repo_url
    ? formatAuditedRepoLabel(record.breakdown.audited_repo_url)
    : "";
  const auditedAt = record?.breakdown.audited_at
    ? formatAuditedAt(record.breakdown.audited_at)
    : "";
  const [history, setHistory] = useState<ProductionAuditHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [openingAuditor, setOpeningAuditor] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase.auth.getUser();
        if (!cancelled) {
          setSignedIn(Boolean(data.user));
        }
      } catch {
        if (!cancelled) {
          setSignedIn(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const openAuditor = async () => {
    if (openingAuditor) {
      return;
    }

    setOpeningAuditor(true);
    try {
      let isSignedIn = signedIn;
      if (isSignedIn == null) {
        const supabase = createClient();
        const { data } = await supabase.auth.getUser();
        isSignedIn = Boolean(data.user);
        setSignedIn(isSignedIn);
      }

      router.push(isSignedIn ? SIGNED_IN_AUDITOR_PATH : PUBLIC_AUDITOR_PATH);
    } catch {
      router.push(PUBLIC_AUDITOR_PATH);
    } finally {
      setOpeningAuditor(false);
    }
  };

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const response = await fetchWithAuth("/api/profile/production-audit");
      if (!response.ok) {
        setHistory([]);
        return;
      }
      const payload = await readJsonResponse<{
        history?: Array<Record<string, unknown>>;
      }>(response);
      setHistory(
        (payload.history ?? [])
          .map((row) => parseProductionAuditHistoryRow(row))
          .filter((entry): entry is ProductionAuditHistoryEntry => Boolean(entry))
      );
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory, record?.productionScore, record?.breakdown.audited_at]);

  const visibilityHint = !canPublish
    ? `Needs ${PUBLIC_SCORECARD_THRESHOLD}+`
    : visible
      ? "Visible"
      : "Hidden";

  return (
    <section
      className={
        compact
          ? "rounded-lg border border-border bg-panel px-3 py-2.5"
          : "rounded-2xl border border-border bg-panel px-5 py-4"
      }
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <p
            className={
              compact
                ? "font-mono text-sm font-semibold tabular-nums text-textMain"
                : "font-mono text-3xl font-extrabold tabular-nums tracking-tight text-textMain"
            }
          >
            {hasScore ? score : "—"}
            <span className="ml-0.5 text-[11px] font-normal text-textMuted">
              /100
            </span>
          </p>
          {hasScore ? (
            <ProductionScoreVerifiedBadge score={score} />
          ) : (
            <span
              className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium leading-none ${NO_AUDIT_BADGE_CLASS}`}
            >
              No audit
            </span>
          )}
        </div>
        <label className="flex shrink-0 items-center gap-2 text-[11px] text-textMuted">
          <span className="hidden sm:inline">Show to employers</span>
          <span className="sm:hidden">Employers</span>
          <EmployerVisibilitySwitch
            checked={visible && canPublish}
            disabled={!canPublish}
            saving={saving}
            onToggle={() => void toggleVisibility()}
          />
        </label>
      </div>

      <div
        className={
          compact
            ? "mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1"
            : "mt-3 flex flex-wrap items-center gap-x-3 gap-y-2"
        }
      >
        {hasScore && record ? (
          <>
            <span className="truncate text-[11px] text-textMuted">
              {repo ? (
                isPrivateAuditedRepoLabel(record.breakdown.audited_repo_url) ? (
                  repo
                ) : (
                  <a
                    href={record.breakdown.audited_repo_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-textMain"
                  >
                    {repo}
                  </a>
                )
              ) : null}
              {repo && auditedAt ? " · " : null}
              {auditedAt || null}
              {visibilityHint ? ` · ${visibilityHint}` : null}
            </span>
            <span className="hidden h-3 w-px bg-border sm:inline" aria-hidden />
            <MetricPill label="CI" score={record.breakdown.ci_cd_score} />
            <MetricPill label="Tests" score={record.breakdown.test_density} />
            <MetricPill label="Errors" score={record.breakdown.error_handling} />
          </>
        ) : (
          <span className="text-[11px] text-textMuted">
            No production audit yet.
          </span>
        )}
      </div>

      {error ? (
        <p className="mt-1 text-[11px] text-red-300" role="alert">
          {error}
        </p>
      ) : null}

      {(historyLoading || history.length > 0 || !alreadyOnAuditor) ? (
        <div className="mt-2 flex items-center justify-between gap-3">
          <AuditHistoryList entries={history} loading={historyLoading} />
          {alreadyOnAuditor ? null : (
            <button
              type="button"
              onClick={() => void openAuditor()}
              disabled={openingAuditor}
              className="ml-auto text-[11px] text-textMuted hover:text-textMain disabled:cursor-wait disabled:opacity-60"
            >
              {hasScore ? "Audit another repo" : "Run audit"}
            </button>
          )}
        </div>
      ) : null}
    </section>
  );
}
