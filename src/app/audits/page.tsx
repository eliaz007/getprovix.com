import GitHubResumeAuditor from "@/components/auditor/github-resume-auditor";
import { buildPageMetadata } from "@/lib/site";

export const metadata = buildPageMetadata(
  "GitHub & Resume Auditor",
  "Run a public GitHub and resume credibility audit without signing in.",
  "/audits"
);

export default function PublicAuditsPage() {
  return <GitHubResumeAuditor />;
}
