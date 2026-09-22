import AuditsPageClient from "@/components/auditor/audits-page-client";
import { buildPageMetadata } from "@/lib/site";
import { PRIVATE_AUDIT_INTENT } from "@/lib/production-audit";
import { githubUrlFromSearchParam } from "@/lib/validate-github-url";

export const dynamic = "force-dynamic";

export const metadata = buildPageMetadata(
  "Code & Resume Auditor",
  "Run a public GitHub and resume credibility audit without signing in.",
  "/audits"
);

export default async function PublicAuditsPage({
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
