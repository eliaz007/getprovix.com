"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import ScoreMeter from "@/components/ScoreMeter";
import { fetchWithAuth } from "@/lib/fetch-with-auth";
import {
  canPublishProductionScore,
  formatAuditedAt,
  formatAuditedRepoLabel,
  getProductionScoreBadge,
  isPrivateAuditedRepoLabel,
  PUBLIC_SCORECARD_THRESHOLD,
  type ProductionAuditRecord,
} from "@/lib/production-audit";

function SubMetric({
  label,
  score,
}: {
  label: string;
  score: number;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-textMuted">
          {label}
        </span>
        <span className="font-mono text-[11px] font-semibold text-textMain">
          {score}/100
        </span>
      </div>
      <ScoreMeter score={score} className="text-textMain" />
    </div>
  );
}

export default function VerifiedCodeQualityScorecard({
  record,
  onVisibilityChange,
}: {
  record: ProductionAuditRecord | null;
  onVisibilityChange?: (visible: boolean) => void;
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
  const [visible, setVisible] = useState(Boolean(record?.isPubliclyVisible));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setVisible(Boolean(record?.isPubliclyVisible));
  }, [record?.isPubliclyVisible]);

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

      setVisible(nextVisible);
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
    <section className="rounded-2xl border border-border bg-panel p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-emerald-400">
            <ShieldCheck className="h-4 w-4" aria-hidden />
            Verified Code Quality Scorecard
          </p>
          <h2 className="mt-2 text-xl font-bold tracking-tight text-textMain">
            Production Audit Score
          </h2>
        </div>
        {hasScore ? (
          <span
            className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold ${badge.className}`}
          >
            {badge.label}
          </span>
        ) : null}
      </div>

      {hasScore && record ? (
        <>
          <div className="flex flex-wrap items-end gap-4">
            <p className="font-mono text-5xl font-extrabold tabular-nums text-textMain">
              {score}
              <span className="ml-1 text-lg font-semibold text-textMuted">/100</span>
            </p>
            <div className="min-w-0 text-sm text-textMuted">
              {repo ? (
                isPrivateAuditedRepoLabel(record.breakdown.audited_repo_url) ? (
                  <p className="font-medium text-textMain">{repo}</p>
                ) : (
                  <a
                    href={record.breakdown.audited_repo_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-textMain hover:text-textMain"
                  >
                    {repo}
                  </a>
                )
              ) : null}
              {auditedAt ? (
                <p className="mt-0.5 text-xs text-textMuted">Audited {auditedAt}</p>
              ) : null}
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <SubMetric
              label="CI/CD Health"
              score={record.breakdown.ci_cd_score}
            />
            <SubMetric
              label="Test Assertion Density"
              score={record.breakdown.test_density}
            />
            <SubMetric
              label="Error Boundaries"
              score={record.breakdown.error_handling}
            />
          </div>

          <div className="mt-6 flex items-center justify-between gap-4 rounded-xl border border-border bg-background p-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-textMain">
                Show Verified Score to Employers
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-textMuted">
                {canPublish
                  ? visible
                    ? "Employers on the roster can see this production score."
                    : "Employers will not see this production score. Your dashboard copy stays private."
                  : `Employers only see ${PUBLIC_SCORECARD_THRESHOLD}+ scorecards. Re-run the audit after fixing CI/CD or test density.`}
              </p>
              {error ? (
                <p className="mt-2 text-xs text-red-300">{error}</p>
              ) : null}
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={visible && canPublish}
              aria-label="Show Verified Score to Employers"
              disabled={!canPublish || saving}
              onClick={() => void toggleVisibility()}
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
 saving ? "opacity-60 cursor-wait" : canPublish ? "cursor-pointer" : "cursor-not-allowed opacity-50"
 } ${visible && canPublish ? "bg-emerald-500" : "bg-panel"}`}
            >
              <span
                className="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform"
                style={{
                  transform:
                    visible && canPublish ? "translateX(20px)" : "translateX(0)",
                }}
              />
            </button>
          </div>
        </>
      ) : (
        <p className="text-sm leading-relaxed text-textMuted">
          Run a public repository audit to attach a verified production score
          to your anonymous developer profile.
        </p>
      )}

      <Link
        href="/audit"
        className="mt-6 inline-flex items-center justify-center rounded-md border border-border bg-brand text-white px-4 py-2.5 text-sm font-medium transition-colors hover:bg-brandHover"
      >
        {hasScore ? "Audit Another Repo" : "Run a Production Audit"}
      </Link>
    </section>
  );
}
