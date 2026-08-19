import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ExternalLink,
  GraduationCap,
  MapPin,
  PlayCircle,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { ProvixLogo } from "@/components/ProvixLogo";
import LockedGitHubReposBadge from "@/components/LockedGitHubReposBadge";
import VerifiedOnProvixPill from "@/components/VerifiedOnProvixPill";
import { resolveCandidateScore } from "@/data/vetted-candidates";
import { getPublicProfileBySlug } from "@/lib/public-profile";
import { buildPublicProfileUrl } from "@/lib/profile-url";
import type { Metadata } from "next";

type PublicProfilePageProps = {
  params: Promise<{ username: string }>;
};

export async function generateMetadata({
  params,
}: PublicProfilePageProps): Promise<Metadata> {
  const { username } = await params;
  const profile = await getPublicProfileBySlug(username);

  if (!profile) {
    return {
      title: "Profile Not Found | Provix",
    };
  }

  return {
    title: `${profile.displayName} | Provix`,
    description:
      profile.bio ??
      `${profile.displayName} — verified candidate profile on Provix.`,
    openGraph: {
      title: `${profile.displayName} | Provix`,
      description:
        profile.bio ??
        "Verified proof-of-work profile on Provix.",
      url: buildPublicProfileUrl(profile.profileSlug),
    },
  };
}

function getAvailabilityClass(status: string | null): string {
  if (status === "Available Now") {
    return "bg-emerald-500/10 text-emerald-300 border-emerald-500/25";
  }

  if (status === "Interviewing") {
    return "bg-amber-500/10 text-amber-300 border-amber-500/25";
  }

  return "bg-slate-800 text-slate-300 border-slate-700";
}

export default async function PublicCandidateProfilePage({
  params,
}: PublicProfilePageProps) {
  const { username } = await params;
  const profile = await getPublicProfileBySlug(username);

  if (!profile) {
    notFound();
  }

  const academicLine = [profile.university, profile.major]
    .filter(Boolean)
    .join(" · ");
  const proofScore = resolveCandidateScore({
    integrity_score: profile.integrityScore,
  });

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-slate-200">
      <header className="border-b border-slate-800/80 bg-[#0A0A0A]/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between gap-4 px-6">
          <Link href="/" className="hover:opacity-90 transition-opacity">
            <ProvixLogo />
          </Link>
          <Link
            href="/login"
            className="text-xs font-semibold text-slate-400 transition-colors hover:text-white"
          >
            Sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-10">
        <div className="overflow-hidden rounded-3xl border border-slate-800/80 bg-[#111111] shadow-2xl">
          <div className="border-b border-slate-800/80 bg-gradient-to-r from-indigo-500/10 via-transparent to-emerald-500/5 px-8 py-8">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl border border-indigo-500/30 bg-indigo-600/20 text-2xl font-bold text-indigo-300">
                {profile.initials}
              </div>

              <div className="min-w-0 flex-1 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-3xl font-extrabold tracking-tight text-white">
                    {profile.displayName}
                  </h1>
                  {profile.hasProofOfWork && <VerifiedOnProvixPill />}
                </div>

                {profile.jobTitle && (
                  <p className="text-sm font-semibold text-indigo-300">
                    {profile.jobTitle}
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                  {profile.location && (
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5" aria-hidden />
                      {profile.location}
                    </span>
                  )}
                  {profile.experienceLevel && (
                    <span className="rounded-full border border-slate-700 bg-slate-900/80 px-2.5 py-1 font-bold uppercase tracking-wide">
                      {profile.experienceLevel}
                    </span>
                  )}
                  {profile.availabilityStatus && (
                    <span
                      className={`rounded-full border px-2.5 py-1 font-bold uppercase tracking-wide ${getAvailabilityClass(profile.availabilityStatus)}`}
                    >
                      {profile.availabilityStatus}
                    </span>
                  )}
                  {profile.hasProofOfWork && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 font-bold text-emerald-300">
                      <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
                      Integrity · {proofScore}/100
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-8 px-8 py-8">
            {profile.bio && (
              <section>
                <h2 className="mb-3 text-[11px] font-bold uppercase tracking-widest text-slate-500">
                  About
                </h2>
                <p className="max-w-3xl text-sm leading-relaxed text-slate-300">
                  {profile.bio}
                </p>
              </section>
            )}

            {profile.skills.length > 0 && (
              <section>
                <h2 className="mb-3 text-[11px] font-bold uppercase tracking-widest text-slate-500">
                  Skills
                </h2>
                <div className="flex flex-wrap gap-2">
                  {profile.skills.map((skill) => (
                    <span
                      key={skill}
                      className="rounded-full border border-slate-700 bg-slate-900/80 px-3 py-1.5 text-xs font-semibold text-slate-200"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </section>
            )}

            {(academicLine || profile.school) && (
              <section>
                <h2 className="mb-3 text-[11px] font-bold uppercase tracking-widest text-slate-500">
                  Academics
                </h2>
                <div className="flex items-start gap-3 rounded-2xl border border-slate-800 bg-[#0A0A0A] p-4">
                  <GraduationCap
                    className="mt-0.5 h-4 w-4 shrink-0 text-indigo-400"
                    aria-hidden
                  />
                  <div>
                    <p className="text-sm font-semibold text-white">
                      {academicLine || profile.school}
                    </p>
                    {profile.school && academicLine && (
                      <p className="mt-1 text-xs text-slate-400">
                        {profile.school}
                      </p>
                    )}
                  </div>
                </div>
              </section>
            )}

            <section>
              <h2 className="mb-3 text-[11px] font-bold uppercase tracking-widest text-slate-500">
                Proof of Work
              </h2>

              {profile.hasProofOfWork ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {profile.hasGitHubRepos && (
                    <LockedGitHubReposBadge className="h-full" />
                  )}

                  {profile.youtubeUrl && (
                    <a
                      href={profile.youtubeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex items-center justify-between rounded-2xl border border-slate-800 bg-[#0A0A0A] px-4 py-4 transition-colors hover:border-indigo-500/40 hover:bg-indigo-500/5"
                    >
                      <span className="flex items-center gap-3">
                        <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700 bg-slate-900/80 text-slate-300">
                          <PlayCircle className="h-4 w-4" aria-hidden />
                        </span>
                        <span>
                          <span className="block text-sm font-semibold text-white">
                            Demo Video
                          </span>
                          <span className="block text-xs text-slate-500">
                            Walkthrough or proof clip
                          </span>
                        </span>
                      </span>
                      <ExternalLink
                        className="h-4 w-4 text-slate-500 transition-colors group-hover:text-indigo-300"
                        aria-hidden
                      />
                    </a>
                  )}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-800 bg-[#0A0A0A] px-4 py-6 text-sm text-slate-500">
                  Proof-of-work links will appear here once the candidate adds
                  portfolio or demo artifacts.
                </div>
              )}
            </section>

            <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/5 px-5 py-4">
              <div className="flex items-start gap-3">
                <Sparkles
                  className="mt-0.5 h-4 w-4 shrink-0 text-indigo-400"
                  aria-hidden
                />
                <div>
                  <p className="text-sm font-semibold text-white">
                    Verified on Provix
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-400">
                    Candidates use Provix career tools for free. Employers hire
                    on a contingency placement model — no upfront subscriptions.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
