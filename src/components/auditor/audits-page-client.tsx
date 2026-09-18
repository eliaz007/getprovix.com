"use client";

import { useEffect, useState } from "react";
import GitHubResumeAuditor from "@/components/auditor/github-resume-auditor";
import VerifiedCodeQualityScorecard from "@/components/dashboard/verified-code-quality-scorecard";
import ScoreTrendChart from "@/components/dashboard/score-trend-chart";
import { useDashboardNav } from "@/components/dashboard/dashboard-nav-context";
import {
  parseProductionAuditFromProfileRow,
  type ProductionAuditRecord,
} from "@/lib/production-audit";
import { createClient } from "@/utils/supabase/client";

export default function AuditsPageClient({
  initialGithubUrl = "",
  initialPrivateWork = false,
}: {
  initialGithubUrl?: string;
  initialPrivateWork?: boolean;
}) {
  const { authLoading, userId, isBusinessAccount } = useDashboardNav();
  const [scorecard, setScorecard] = useState<ProductionAuditRecord | null>(null);
  const [showScorecard, setShowScorecard] = useState(false);

  useEffect(() => {
    let cancelled = false;

    // Keep the auditor form mounted; scorecard is a non-blocking side panel.
    if (authLoading) {
      return;
    }

    if (!userId || isBusinessAccount) {
      setShowScorecard(false);
      setScorecard(null);
      return;
    }

    const loadScorecard = async () => {
      try {
        const supabase = createClient();
        const { data: profile } = await supabase
          .from("profiles")
          .select(
            "production_score, audit_breakdown, is_audit_verified, is_publicly_visible, role"
          )
          .or(`id.eq.${userId},user_id.eq.${userId}`)
          .limit(1)
          .maybeSingle();

        if (cancelled) {
          return;
        }

        const role = typeof profile?.role === "string" ? profile.role : null;
        if (role === "employer" || role === "business") {
          setShowScorecard(false);
          return;
        }

        setShowScorecard(true);
        setScorecard(parseProductionAuditFromProfileRow(profile));
      } catch {
        if (!cancelled) {
          setShowScorecard(false);
        }
      }
    };

    void loadScorecard();

    return () => {
      cancelled = true;
    };
  }, [authLoading, userId, isBusinessAccount]);

  const handleVisibilityChange = (nextVisible: boolean) => {
    setScorecard((prev) =>
      prev ? { ...prev, isPubliclyVisible: nextVisible } : prev
    );
  };

  return (
    <GitHubResumeAuditor
      key={`${initialGithubUrl}-${initialPrivateWork ? "private" : "public"}`}
      initialGithubUrl={initialGithubUrl}
      initialPrivateWork={initialPrivateWork}
      sidePanel={
        showScorecard ? (
          <ScoreTrendChart
            className="h-full"
            repoUrl={scorecard?.breakdown.audited_repo_url}
            current={
              scorecard
                ? {
                    score: scorecard.productionScore,
                    auditedAt: scorecard.breakdown.audited_at,
                    repoUrl: scorecard.breakdown.audited_repo_url,
                  }
                : null
            }
          />
        ) : undefined
      }
      scoreSummary={
        showScorecard ? (
          <VerifiedCodeQualityScorecard
            compact={false}
            record={scorecard}
            onVisibilityChange={handleVisibilityChange}
          />
        ) : null
      }
      onAuditPersisted={(record) => {
        setShowScorecard(true);
        setScorecard(record);
      }}
    />
  );
}
