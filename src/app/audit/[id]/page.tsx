import Link from "next/link";
import { notFound } from "next/navigation";
import CopyShareLinkButton from "@/components/auditor/copy-share-link-button";
import AuditResultsPanel from "@/components/auditor/audit-results-panel";
import { ProvixLogo } from "@/components/ProvixLogo";
import { getSharedAudit } from "@/lib/shared-audit";
import { buildPageMetadata } from "@/lib/site";

export const dynamic = "force-dynamic";

type SharedAuditPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: SharedAuditPageProps) {
  const { id } = await params;
  const audit = await getSharedAudit(id);
  if (!audit) {
    return buildPageMetadata(
      "Audit not found",
      "This shared production audit is unavailable.",
      `/audit/${id}`
    );
  }

  const repo = audit.repoName ?? "Repository";
  return buildPageMetadata(
    `${repo} production audit`,
    `Read-only Provix production audit for ${repo}.`,
    `/audit/${id}`
  );
}

export default async function SharedAuditPage({ params }: SharedAuditPageProps) {
  const { id } = await params;
  const audit = await getSharedAudit(id);
  if (!audit) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-background text-textMuted">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-5">
          <Link href="/" className="transition-opacity hover:opacity-90">
            <ProvixLogo />
          </Link>
          <CopyShareLinkButton label="Copy Share Link" />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        <AuditResultsPanel
          result={audit.result}
          repoName={audit.repoName ?? undefined}
          repoUrl={audit.repoUrl ?? undefined}
          readOnly
        />
      </main>
    </div>
  );
}
