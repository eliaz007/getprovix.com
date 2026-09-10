import AuditsPageClient from "@/components/auditor/audits-page-client";
import { PRIVATE_AUDIT_INTENT } from "@/lib/production-audit";
import { githubUrlFromSearchParam } from "@/lib/validate-github-url";

export default async function AuditorPage({
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
