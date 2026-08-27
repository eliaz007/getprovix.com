import type { Metadata } from "next";
import GitHubResumeAuditor from "@/components/auditor/github-resume-auditor";

export const metadata: Metadata = {
  title: "GitHub & Resume Auditor — Provix",
  description:
    "Run a public GitHub and resume credibility audit without signing in.",
};

export default function PublicAuditsPage() {
  return <GitHubResumeAuditor />;
}
