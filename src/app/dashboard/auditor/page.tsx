import { Suspense } from "react";
import AuditsPageClient from "@/components/auditor/audits-page-client";
import { DashboardContentSkeleton } from "@/components/dashboard/dashboard-skeleton";
import { PRIVATE_AUDIT_INTENT } from "@/lib/production-audit";
import { buildPageMetadata } from "@/lib/site";
import { githubUrlFromSearchParam } from "@/lib/validate-github-url";

export const metadata = buildPageMetadata(
  "Code & Resume Auditor",
  "Run a GitHub and resume credibility audit with production scorecards.",
  "/dashboard/auditor"
);

async function AuditorPageContent({
  searchParams,
}: {
  searchParams: Promise<{ github?: string | string[]; intent?: string | string[] }>;
}) {
  const params = await searchParams;
  const initialGithubUrl = githubUrlFromSearchParam(params.github);
  const intent = Array.isArray(params.intent) ? params.intent[0] : params.intent;

  return (
    <AuditsPageClient
      initialGithubUrl={initialGithubUrl}
      initialPrivateWork={intent === PRIVATE_AUDIT_INTENT}
    />
  );
}

export default function AuditorPage({
  searchParams,
}: {
  searchParams: Promise<{ github?: string | string[]; intent?: string | string[] }>;
}) {
  return (
    <Suspense fallback={<DashboardContentSkeleton />}>
      <AuditorPageContent searchParams={searchParams} />
    </Suspense>
  );
}
