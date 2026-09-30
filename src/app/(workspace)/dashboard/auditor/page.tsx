import AuditsPageClient from "@/components/auditor/audits-page-client";
import { PRIVATE_AUDIT_INTENT } from "@/lib/production-audit";
import { githubUrlFromSearchParam } from "@/lib/validate-github-url";

export const dynamic = "force-dynamic";

const SEARCH_PARAMS_TIMEOUT_MS = 2500;

type AuditorSearchParams = {
  github?: string | string[];
  intent?: string | string[];
};

async function readSearchParams(
  searchParams: Promise<AuditorSearchParams>
): Promise<AuditorSearchParams> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      searchParams,
      new Promise<AuditorSearchParams>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error("Auditor search params timed out"));
        }, SEARCH_PARAMS_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

export default async function AuditorPage({
  searchParams,
}: {
  searchParams: Promise<AuditorSearchParams>;
}) {
  let initialGithubUrl = "";
  let initialPrivateWork = false;

  try {
    const params = await readSearchParams(searchParams);
    initialGithubUrl = githubUrlFromSearchParam(params.github);
    const intent = Array.isArray(params.intent) ? params.intent[0] : params.intent;
    initialPrivateWork = intent === PRIVATE_AUDIT_INTENT;
  } catch (error) {
    console.error("Auditor page failed to resolve search params:", error);
  }

  return (
    <AuditsPageClient
      initialGithubUrl={initialGithubUrl}
      initialPrivateWork={initialPrivateWork}
    />
  );
}
