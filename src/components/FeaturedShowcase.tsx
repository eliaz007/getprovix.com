import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { FeaturedBuilder } from "@/lib/featured-builders";
import LockedGitHubReposBadge from "@/components/LockedGitHubReposBadge";
import VerifiedOnProvixPill from "@/components/VerifiedOnProvixPill";
import WorkPreferenceTimezoneBadge from "@/components/WorkPreferenceTimezoneBadge";
import Card from "@/components/ui/Card";
import ScoreMeter from "@/components/ScoreMeter";

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
        className="h-14 w-14 rounded-lg border border-border object-cover"
      />
    );
  }

  return (
    <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-border bg-background text-base font-mono font-bold text-textMuted">
      {builder.initials}
    </div>
  );
}

function BuilderCard({ builder }: { builder: FeaturedBuilder }) {
  return (
    <Card as="article" interactive className="flex h-full flex-col p-6">
      <div className="flex items-start gap-4">
        <BuilderAvatar builder={builder} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-lg font-bold tracking-tight text-textMain">
              {builder.fullName}
            </h3>
            <VerifiedOnProvixPill
              verified={builder.verifiedOnProvix}
              className="shrink-0"
            />
          </div>
          <p className="mt-1 truncate text-sm font-medium text-textMain">
            {builder.roleTitle}
          </p>
          <WorkPreferenceTimezoneBadge
            workPreference={builder.workPreference}
            timezone={builder.timezone}
            className="mt-2"
          />
        </div>
      </div>

      <p className="mt-4 line-clamp-3 text-sm leading-relaxed text-textMuted">
        {builder.bioSnippet}
      </p>

      {builder.skills.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {builder.skills.map((skill) => (
            <span
              key={skill}
              className="rounded-md border border-border bg-background px-2.5 py-1 text-[10px] font-semibold text-textMain"
            >
              {skill}
            </span>
          ))}
        </div>
      )}

      {builder.hasGitHubRepos && (
        <LockedGitHubReposBadge className="mt-4" />
      )}

      <div
        className={`mt-5 flex items-center gap-3 ${
 builder.proofScore !== null ? "justify-between" : "justify-end"
 }`}
      >
        {builder.proofScore !== null && (
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="font-mono text-sm font-semibold tabular-nums text-textMain">
              {builder.proofScore}/100
            </span>
            <ScoreMeter score={builder.proofScore} className="w-20" />
          </div>
        )}

        <Link
          href={`/p/${builder.profileSlug}`}
          className="inline-flex items-center gap-1 font-mono text-xs font-medium text-textMuted transition-colors duration-200 ease-out hover:text-textMain"
        >
          /p/{builder.profileSlug}
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>
    </Card>
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
        <p className="text-[11px] font-semibold uppercase tracking-widest text-textMuted">
          Featured Builders
        </p>
        <h2 className="mt-4 text-2xl sm:text-3xl font-extrabold tracking-tight text-textMain">
          Builders with verified proof-of-work
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-textMuted">
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
