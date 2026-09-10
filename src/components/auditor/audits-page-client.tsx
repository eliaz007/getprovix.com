"use client";

import { useEffect, useState } from "react";
import GitHubResumeAuditor from "@/components/auditor/github-resume-auditor";
import VerifiedCodeQualityScorecard from "@/components/dashboard/verified-code-quality-scorecard";
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
  const [scorecard, setScorecard] = useState<ProductionAuditRecord | null>(null);
  const [showScorecard, setShowScorecard] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase.auth.getUser();
        if (!data.user) {
          if (!cancelled) {
            setShowScorecard(false);
            setScorecard(null);
          }
          return;
        }

        const { data: profile } = await supabase
          .from("profiles")
          .select(
            "production_score, audit_breakdown, is_audit_verified, is_publicly_visible, role"
          )
          .or(`id.eq.${data.user.id},user_id.eq.${data.user.id}`)
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

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-8">
      {showScorecard ? (
        <VerifiedCodeQualityScorecard
          record={scorecard}
          onVisibilityChange={(nextVisible) => {
            setScorecard((prev) =>
              prev ? { ...prev, isPubliclyVisible: nextVisible } : prev
            );
          }}
        />
      ) : null}
      <GitHubResumeAuditor
        key={`${initialGithubUrl}-${initialPrivateWork ? "private" : "public"}`}
        initialGithubUrl={initialGithubUrl}
        initialPrivateWork={initialPrivateWork}
        onAuditPersisted={(record) => {
          setShowScorecard(true);
          setScorecard(record);
        }}
      />
    </div>
  );
}
