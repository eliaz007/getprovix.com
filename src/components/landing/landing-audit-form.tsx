"use client";

import PublicProductionAudit from "@/components/auditor/public-production-audit";

export default function LandingAuditForm() {
  return (
    <div id="audit" className="mx-auto mt-10 w-full max-w-4xl scroll-mt-24 text-left">
      <PublicProductionAudit
        embedded
        showEmptyState={false}
        formId="landing-audit-repo"
        submitLabel="Get Verified"
        inputPlaceholder="Paste your GitHub repo or project URL..."
        helperText="Free instant audit • Modularity, cadence & hygiene metrics • Join the talent network"
      />
    </div>
  );
}
