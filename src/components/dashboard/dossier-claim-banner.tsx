"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import DossierVerifiedCard from "@/components/auditor/dossier-verified-card";
import { DOSSIER_PUBLISHED_EVENT } from "@/lib/production-audit";

function DossierClaimBannerInner() {
  const params = useSearchParams();
  const [publishedEvent, setPublishedEvent] = useState(false);
  const published = publishedEvent || params.get("dossier") === "published";
  const claimError = params.get("claim_error")?.trim() || null;

  useEffect(() => {
    const onPublished = () => setPublishedEvent(true);
    window.addEventListener(DOSSIER_PUBLISHED_EVENT, onPublished);
    return () => window.removeEventListener(DOSSIER_PUBLISHED_EVENT, onPublished);
  }, []);

  if (published) {
    return <DossierVerifiedCard className="mb-6" />;
  }

  if (claimError) {
    return (
      <div
        role="alert"
        className="mx-4 mt-4 rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-200 md:mx-6"
      >
        {claimError}
      </div>
    );
  }

  return null;
}

export default function DossierClaimBanner() {
  return (
    <Suspense fallback={null}>
      <DossierClaimBannerInner />
    </Suspense>
  );
}
