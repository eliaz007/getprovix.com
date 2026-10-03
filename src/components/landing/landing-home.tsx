"use client";

import dynamic from "next/dynamic";
import Link from "next/link";

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
  return (
    <>
      <div className="mx-auto mt-8 flex w-full justify-center">
        <Link
          href="/dashboard"
          className="inline-flex min-h-12 cursor-pointer items-center justify-center rounded-lg bg-brand px-8 text-sm font-semibold tracking-tight text-white shadow-[0_0_20px_rgba(124,58,237,0.25)] transition-colors hover:bg-brandHover"
        >
          Benchmark Your Repository
        </Link>
      </div>

      <LandingAudienceCards />
    </>
  );
}
