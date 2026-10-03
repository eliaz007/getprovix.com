import Link from "next/link";
import { redirect } from "next/navigation";
import { ProvixLogo } from "@/components/ProvixLogo";
import MarketingAuthLink from "@/components/marketing-auth-link";
import { buildPageMetadata } from "@/lib/site";
import { githubUrlFromAuditQuery } from "@/lib/validate-github-url";

export const dynamic = "force-dynamic";

export const metadata = buildPageMetadata(
  "Roster Verification",
  "Benchmark your own GitHub repository for the Provix Founder Roster. Sign in to submit a build for verification.",
  "/audit"
);

export default async function PublicAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ repo?: string | string[]; github?: string | string[] }>;
}) {
  const params = await searchParams;
  const initialRepoUrl = githubUrlFromAuditQuery(params);

  // Preserve deep links into the signed-in verification flow.
  if (initialRepoUrl) {
    redirect(
      `/login?next=${encodeURIComponent(
        `/dashboard/auditor?github=${encodeURIComponent(initialRepoUrl)}`
      )}`
    );
  }

  return (
    <div className="min-h-screen bg-background text-textMuted">
      <header className="border-b border-border print:hidden">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-5">
          <Link href="/" className="transition-opacity hover:opacity-90">
            <ProvixLogo />
          </Link>
          <nav className="flex items-center gap-3">
            <MarketingAuthLink />
          </nav>
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col px-6 pb-20 pt-12 sm:pt-16">
        <div className="mx-auto max-w-2xl text-center">
          <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-brand">
            Provix Roster Verification
          </p>
          <h1 className="text-3xl font-extrabold tracking-tight text-textMain sm:text-4xl">
            Open repository scanning has moved
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-textMuted sm:text-base">
            Anonymous audits are no longer available on the public site. Builders
            sign in with GitHub to verify repositories they own. Founders request
            roster access to review 75+ candidates.
          </p>
          <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
            <Link
              href="/login?next=/dashboard/auditor"
              className="inline-flex min-h-12 cursor-pointer items-center justify-center rounded-lg bg-brand px-6 text-sm font-semibold text-white transition-colors hover:bg-brandHover"
            >
              Benchmark Your Build
            </Link>
            <Link
              href="/pricing"
              className="inline-flex min-h-12 cursor-pointer items-center justify-center rounded-lg border border-border px-6 text-sm font-semibold text-textMain transition-colors hover:bg-panel"
            >
              Request Roster Access
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
