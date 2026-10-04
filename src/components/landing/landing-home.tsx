"use client";

import dynamic from "next/dynamic";

const LandingAudienceCards = dynamic(
  () => import("@/components/landing/landing-audience-cards"),
  { ssr: true }
);

export default function LandingHome({
  isPublicTeaser: _isPublicTeaser = false,
}: {
  /** Kept for call-site compatibility; public teaser audits are admin-only. */
  isPublicTeaser?: boolean;
}) {
  return <LandingAudienceCards />;
}
