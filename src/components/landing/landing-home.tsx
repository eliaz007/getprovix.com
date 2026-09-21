"use client";

import { useState } from "react";
import ComparisonShowcase from "@/components/ComparisonShowcase";
import PublicProductionAudit from "@/components/auditor/public-production-audit";
import LandingAudienceCards from "@/components/landing/landing-audience-cards";

export default function LandingHome() {
  const [hasAuditResults, setHasAuditResults] = useState(false);

  return (
    <>
      <div className="mx-auto mt-6 w-full max-w-4xl text-left">
        <PublicProductionAudit
          embedded
          showEmptyState={false}
          onHasResultsChange={setHasAuditResults}
        />
      </div>
      {!hasAuditResults ? (
        <>
          <ComparisonShowcase />
          <LandingAudienceCards />
        </>
      ) : null}
    </>
  );
}
