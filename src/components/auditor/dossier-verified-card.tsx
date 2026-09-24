import Link from "next/link";
import { ArrowRight, Settings, ShieldCheck } from "lucide-react";

export default function DossierVerifiedCard({
  profileSlug,
  className = "",
}: {
  profileSlug?: string | null;
  className?: string;
}) {
  const dossierHref = profileSlug?.trim()
    ? `/p/${profileSlug.trim()}`
    : "/dashboard/profile";

  return (
    <section
      className={`rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-5 ${className}`.trim()}
    >
      <p className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-400">
        <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
        Claimed
      </p>
      <h3 className="mt-2 text-base font-bold tracking-tight text-zinc-50">
        Dossier Verified & Published
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-zinc-400">
        Your proof-of-work has met the production benchmark and is now actively
        discoverable by hiring engineering teams. You maintain complete control
        over your visibility and can disable talent pool discovery at any time
        in your account preferences.
      </p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Link
          href={dossierHref}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2.5 text-xs font-bold tracking-tight text-white transition-colors hover:bg-emerald-500"
        >
          View Public Dossier
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
        <Link
          href="/dashboard/profile"
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-xs font-bold tracking-tight text-zinc-200 transition-colors hover:bg-zinc-900"
        >
          <Settings className="h-3.5 w-3.5" aria-hidden />
          Go to Candidate Settings
        </Link>
      </div>
    </section>
  );
}
