"use client";

import PublicProductionAudit from "@/components/auditor/public-production-audit";

export default function LandingAuditForm() {
  return (
    <div className="mx-auto mt-10 w-full max-w-4xl text-left">
      <PublicProductionAudit embedded showEmptyState={false} />
    </div>
  );
}
