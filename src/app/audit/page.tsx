import Link from "next/link";
import { ProvixLogo } from "@/components/ProvixLogo";
import PublicProductionAudit from "@/components/auditor/public-production-audit";
import MarketingAuthLink from "@/components/marketing-auth-link";
import { buildPageMetadata } from "@/lib/site";
import { githubUrlFromAuditQuery } from "@/lib/validate-github-url";

export const metadata = buildPageMetadata(
  "Production Audit",
  "Run a public GitHub production audit and view the scorecard without signing in.",
  "/audit"
);

export default async function PublicAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ repo?: string | string[]; github?: string | string[] }>;
}) {
  const params = await searchParams;
  const initialRepoUrl = githubUrlFromAuditQuery(params);

  return (
    <div className="min-h-screen bg-background text-textMuted">
      <header className="border-b border-border">
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
        <div className="mb-8 max-w-3xl">
          <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-brand">
            Public production audit
          </p>
          <h1 className="text-3xl font-extrabold tracking-tight text-textMain sm:text-4xl">
            Score a public repository
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-textMuted sm:text-base">
            Instantly analyze repository architecture, test assertion
            density, and CI/CD pipelines. No account required.
          </p>
        </div>

        <PublicProductionAudit
          key={initialRepoUrl}
          initialRepoUrl={initialRepoUrl}
        />
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-4 px-6 py-8 sm:flex-row sm:items-center">
          <p className="text-xs text-textMuted">
            © {new Date().getFullYear()} Provix. Verified candidate intelligence.
          </p>
          <div className="flex items-center gap-5 text-xs font-medium">
            <Link
              href="/"
              className="text-textMuted transition-colors duration-200 hover:text-textMain"
            >
              Home
            </Link>
            <Link
              href="/privacy"
              className="text-textMuted transition-colors duration-200 hover:text-textMain"
            >
              Privacy
            </Link>
            <Link
              href="/terms"
              className="text-textMuted transition-colors duration-200 hover:text-textMain"
            >
              Terms
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
