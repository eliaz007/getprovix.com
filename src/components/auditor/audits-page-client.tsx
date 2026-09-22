"use client";

import { useEffect, useState } from "react";
import GitHubResumeAuditor from "@/components/auditor/github-resume-auditor";
import VerificationDossierPanel from "@/components/auditor/verification-dossier-panel";
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
    <div className="-mx-4 -my-8 min-h-[calc(100vh-3.5rem)] bg-[#0B0B0D] px-4 py-8">
      <GitHubResumeAuditor
        key={`${initialGithubUrl}-${initialPrivateWork ? "private" : "public"}`}
        initialGithubUrl={initialGithubUrl}
        initialPrivateWork={initialPrivateWork}
        sidePanel={
          showScorecard ? (
            <VerificationDossierPanel scorecard={scorecard} className="h-full" />
          ) : undefined
        }
        scoreSummary={null}
        onAuditPersisted={(record) => {
          setShowScorecard(true);
          setScorecard(record);
        }}
      />
    </div>
  );
}
