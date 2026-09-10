"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { fetchWithAuth } from "@/lib/fetch-with-auth";
import {
  canPublishProductionScore,
  formatAuditedAt,
  formatAuditedRepoLabel,
  getProductionScoreBadge,
  isPrivateAuditedRepoLabel,
  parseProductionAuditHistoryRow,
  PUBLIC_SCORECARD_THRESHOLD,
  type ProductionAuditHistoryEntry,
  type ProductionAuditRecord,
} from "@/lib/production-audit";

function MetricChip({ label, score }: { label: string; score: number }) {
  return (
    <div className="rounded-md border border-border bg-background px-2 py-1.5 text-center">
      <p className="font-mono text-sm font-bold tabular-nums text-textMain">
        {score}
      </p>
      <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-textMuted">
        {label}
      </p>
    </div>
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
      <p className="mt-3 text-[11px] text-textMuted">Loading audit history…</p>
    );
  }

  if (entries.length === 0) {
    return null;
  }

  return (
    <details className="mt-3 border-t border-border pt-2 group">
      <summary className="cursor-pointer list-none text-[10px] font-bold uppercase tracking-wider text-textMuted [&::-webkit-details-marker]:hidden">
        Audit history ({entries.length})
      </summary>
      <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto">
        {entries.map((entry) => {
          const repo = formatAuditedRepoLabel(entry.auditedRepoUrl);
          const when = formatAuditedAt(entry.auditedAt || entry.createdAt);
          return (
            <li
              key={entry.id}
              className="flex items-start justify-between gap-3 rounded-md border border-border/70 bg-background/60 px-2 py-1.5"
            >
              <div className="min-w-0">
                <p className="truncate text-[11px] font-medium text-textMain">
                  {repo}
                </p>
                <p className="mt-0.5 text-[10px] text-textMuted">
                  {when || "—"} · CI {entry.ciCdScore} · Tests{" "}
                  {entry.testDensity} · Errors {entry.errorHandling}
                </p>
              </div>
              <p className="shrink-0 font-mono text-xs font-bold tabular-nums text-textMain">
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
  const hasScore = Boolean(record?.isAuditVerified);
  const score = record?.productionScore ?? 0;
  const canPublish = canPublishProductionScore(score);
  const badge = getProductionScoreBadge(score);
  const repo = record?.breakdown.audited_repo_url
    ? formatAuditedRepoLabel(record.breakdown.audited_repo_url)
    : "";
  const auditedAt = record?.breakdown.audited_at
    ? formatAuditedAt(record.breakdown.audited_at)
    : "";
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<ProductionAuditHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
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

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const response = await fetchWithAuth("/api/profile/production-audit");
      if (!response.ok) {
        setHistory([]);
        return;
      }
      const payload = (await response.json()) as {
        history?: Array<Record<string, unknown>>;
      };
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

  const toggleVisibility = async () => {
    if (!hasScore || !canPublish || saving) {
      return;
    }

    const nextVisible = !visible;
    setSaving(true);
    setError(null);

    try {
      const response = await fetchWithAuth("/api/profile/production-audit", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_publicly_visible: nextVisible }),
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Could not update visibility.");
      }

      setVisibilityOverride(nextVisible);
      onVisibilityChange?.(nextVisible);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not update visibility."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      className={`rounded-xl border border-border bg-panel ${
        compact ? "p-3" : "p-4"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-emerald-400">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
          Production Audit
        </p>
        {hasScore ? (
          <span
            className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold ${badge.className}`}
          >
            {badge.label}
          </span>
        ) : null}
      </div>

      {hasScore && record ? (
        <>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <p className="font-mono text-2xl font-extrabold tabular-nums text-textMain">
              {score}
              <span className="ml-1 text-[10px] font-semibold text-textMuted">
                /100
              </span>
            </p>
            <div className="min-w-0 pb-0.5 text-[11px] text-textMuted">
              {repo ? (
                isPrivateAuditedRepoLabel(record.breakdown.audited_repo_url) ? (
                  <p className="font-medium text-textMain">{repo}</p>
                ) : (
                  <a
                    href={record.breakdown.audited_repo_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-textMain hover:underline"
                  >
                    {repo}
                  </a>
                )
              ) : null}
              {auditedAt ? <p className="text-[10px]">Audited {auditedAt}</p> : null}
            </div>
          </div>

          <div className="mt-2 grid grid-cols-3 gap-1.5">
            <MetricChip label="CI/CD" score={record.breakdown.ci_cd_score} />
            <MetricChip label="Tests" score={record.breakdown.test_density} />
            <MetricChip
              label="Errors"
              score={record.breakdown.error_handling}
            />
          </div>

          <div className="mt-2 flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-2.5 py-2">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-textMain">
                Show to employers
              </p>
              <p className="mt-0.5 text-[10px] leading-relaxed text-textMuted">
                {canPublish
                  ? visible
                    ? "Visible on the talent roster."
                    : "Hidden from employers."
                  : `Needs ${PUBLIC_SCORECARD_THRESHOLD}+ to publish.`}
              </p>
              {error ? (
                <p className="mt-1 text-[10px] text-red-300">{error}</p>
              ) : null}
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={visible && canPublish}
              aria-label="Show Verified Score to Employers"
              disabled={!canPublish || saving}
              onClick={() => void toggleVisibility()}
              className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
                saving
                  ? "cursor-wait opacity-60"
                  : canPublish
                    ? "cursor-pointer"
                    : "cursor-not-allowed opacity-50"
              } ${visible && canPublish ? "bg-emerald-500" : "bg-panel"}`}
            >
              <span
                className="absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform"
                style={{
                  transform:
                    visible && canPublish ? "translateX(16px)" : "translateX(0)",
                }}
              />
            </button>
          </div>

          <AuditHistoryList entries={history} loading={historyLoading} />
        </>
      ) : (
        <>
          <p className="mt-2 text-[11px] leading-relaxed text-textMuted">
            Run a public repository audit to attach a verified production score
            to your profile.
          </p>
          <AuditHistoryList entries={history} loading={historyLoading} />
        </>
      )}

      <Link
        href="/audit"
        className="mt-2 inline-flex w-full items-center justify-center rounded-md border border-border bg-brand px-3 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-brandHover"
      >
        {hasScore ? "Audit another repo" : "Run a production audit"}
      </Link>
    </section>
  );
}
