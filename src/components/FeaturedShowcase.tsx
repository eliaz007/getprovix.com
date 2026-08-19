import Link from "next/link";
import { ArrowUpRight, ShieldCheck } from "lucide-react";
import type { FeaturedBuilder } from "@/lib/featured-builders";
import LockedGitHubReposBadge from "@/components/LockedGitHubReposBadge";
import VerifiedOnProvixPill from "@/components/VerifiedOnProvixPill";
import WorkPreferenceTimezoneBadge from "@/components/WorkPreferenceTimezoneBadge";

type FeaturedShowcaseProps = {
  builders: FeaturedBuilder[];
  embedded?: boolean;
};

function BuilderAvatar({ builder }: { builder: FeaturedBuilder }) {
  if (builder.avatarUrl) {
    return (
      <img
        src={builder.avatarUrl}
        alt=""
        className="h-14 w-14 rounded-2xl border border-indigo-500/30 object-cover shadow-lg shadow-indigo-500/10"
      />
    );
  }

  return (
    <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-indigo-500/30 bg-gradient-to-br from-indigo-500/20 to-cyan-500/10 text-base font-bold text-indigo-300 shadow-lg shadow-indigo-500/10">
      {builder.initials}
    </div>
  );
}

function BuilderCard({ builder }: { builder: FeaturedBuilder }) {
  return (
    <article className="group relative flex h-full flex-col rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.25)] transition-all duration-300 hover:-translate-y-1 hover:border-indigo-500/40 hover:shadow-[0_24px_70px_rgba(99,102,241,0.12)]">
      <div className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-100 bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.12),_transparent_55%)]" />

      <div className="relative flex items-start gap-4">
        <BuilderAvatar builder={builder} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-lg font-bold text-white">
              {builder.fullName}
            </h3>
            <VerifiedOnProvixPill className="shrink-0" />
          </div>
          <p className="mt-1 truncate text-sm font-medium text-indigo-400">
            {builder.roleTitle}
          </p>
          <WorkPreferenceTimezoneBadge
            workPreference={builder.workPreference}
            timezone={builder.timezone}
            className="mt-2"
          />
        </div>
      </div>

      <p className="relative mt-4 line-clamp-3 text-sm leading-relaxed text-zinc-400">
        {builder.bioSnippet}
      </p>

      {builder.skills.length > 0 && (
        <div className="relative mt-4 flex flex-wrap gap-1.5">
          {builder.skills.map((skill) => (
            <span
              key={skill}
              className="rounded-md border border-indigo-500/20 bg-indigo-500/10 px-2.5 py-1 text-[10px] font-bold text-indigo-300"
            >
              {skill}
            </span>
          ))}
        </div>
      )}

      {builder.hasGitHubRepos && (
        <LockedGitHubReposBadge className="relative mt-4" />
      )}

      <div
        className={`relative mt-5 flex items-center gap-3 ${
          builder.proofScore !== null ? "justify-between" : "justify-end"
        }`}
      >
        {builder.proofScore !== null && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1 text-[11px] font-bold text-emerald-300">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            Proof Score · {builder.proofScore}/100
          </span>
        )}

        <Link
          href={`/p/${builder.profileSlug}`}
          className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-400 transition-colors hover:text-indigo-300"
        >
          View Profile
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}

function getFeaturedGridClass(count: number): string {
  if (count === 1) {
    return "grid grid-cols-1 max-w-md mx-auto gap-5";
  }

  if (count === 2) {
    return "grid grid-cols-1 gap-5 sm:grid-cols-2 max-w-3xl mx-auto";
  }

  return "grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3";
}

export default function FeaturedShowcase({
  builders,
  embedded = false,
}: FeaturedShowcaseProps) {
  if (builders.length === 0) {
    return null;
  }

  return (
    <section
      id="featured-builders"
      className={
        embedded
          ? "mt-16 max-w-6xl mx-auto scroll-mt-24 text-left"
          : "max-w-6xl mx-auto px-6 pb-24 scroll-mt-24"
      }
    >
      <div className="mb-10 text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-500/20 bg-indigo-500/10 px-3 py-1.5 text-xs font-mono font-semibold text-indigo-400">
          Featured Builders
        </span>
        <h2 className="mt-4 text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
          Builders with verified proof-of-work
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-sm text-zinc-400">
          Real profiles from the Provix talent pool — screened for GitHub depth,
          integrity, and technical signal before they reach your inbox.
        </p>
      </div>

      <div className={getFeaturedGridClass(builders.length)}>
        {builders.map((builder) => (
          <BuilderCard key={builder.id} builder={builder} />
        ))}
      </div>
    </section>
  );
}
