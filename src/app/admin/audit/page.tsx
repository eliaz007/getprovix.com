import Link from "next/link";
import { ProvixLogo } from "@/components/ProvixLogo";
import PublicProductionAudit from "@/components/auditor/public-production-audit";
import SignOutButton from "@/components/SignOutButton";
import { buildPageMetadata } from "@/lib/site";

export const dynamic = "force-dynamic";

export const metadata = buildPageMetadata(
  "Admin Repository Auditor",
  "Platform-admin unrestricted production audits for any public repository.",
  "/admin/audit"
);

export default function AdminAuditPage() {
  return (
    <div className="min-h-screen bg-[#090A0F] text-zinc-300">
      <header className="border-b border-white/[0.08]">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-5">
          <Link href="/admin" className="transition-opacity hover:opacity-90">
            <ProvixLogo />
          </Link>
          <nav className="flex items-center gap-3 text-sm">
            <Link
              href="/admin/requests"
              className="text-zinc-400 transition-colors hover:text-zinc-100"
            >
              Intro pipeline
            </Link>
            <span className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-amber-200">
              Admin auditor
            </span>
            <SignOutButton />
          </nav>
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col px-6 pb-20 pt-12 sm:pt-16">
        <div className="mb-8 max-w-3xl">
          <p className="mb-3 font-mono text-[11px] font-bold uppercase tracking-widest text-amber-300">
            Protected admin route
          </p>
          <h1 className="text-3xl font-extrabold tracking-tight text-zinc-50 sm:text-4xl">
            Unrestricted repository auditor
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-400 sm:text-base">
            Run ad-hoc production audits on any public repository. This surface
            is not part of the public product and skips candidate authorship
            gates used on the Provix Roster Verification flow.
          </p>
        </div>

        <PublicProductionAudit isPublicTeaser embedded={false} />
      </main>
    </div>
  );
}
