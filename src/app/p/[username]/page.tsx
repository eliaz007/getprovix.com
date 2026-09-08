import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ExternalLink,
  GraduationCap,
  MapPin,
  PlayCircle,
  ShieldCheck,
} from "lucide-react";
import { ProvixLogo } from "@/components/ProvixLogo";
import LockedGitHubReposBadge from "@/components/LockedGitHubReposBadge";
import VerifiedOnProvixPill from "@/components/VerifiedOnProvixPill";
import WorkPreferenceTimezoneBadge from "@/components/WorkPreferenceTimezoneBadge";
import Card from "@/components/ui/Card";
import ScoreMeter from "@/components/ScoreMeter";
import { resolveCandidateScore } from "@/lib/candidate-score";
import { PUBLIC_PLACEMENT_TERMS_SUMMARY } from "@/lib/placement-terms";
import { formatGpa } from "@/lib/gpa";
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
      title: "Profile Not Found",
      robots: { index: false, follow: false },
    };
  }

  const description =
    profile.bio ??
    `${profile.displayName} — verified candidate profile on Provix.`;
  const url = buildPublicProfileUrl(profile.profileSlug);
  const title = profile.displayName;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "profile",
      locale: "en_US",
      siteName: "Provix",
      title: `${title} | Provix`,
      description:
        profile.bio ?? "Verified proof-of-work profile on Provix.",
      url,
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} | Provix`,
      description,
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

          const academicLine = [
            profile.university,
            profile.major,
            formatGpa(profile.gpa) ? `GPA ${formatGpa(profile.gpa)}` : null,
            profile.graduationYear ? `Class of ${profile.graduationYear}` : null,
          ]
            .filter(Boolean)
            .join(" · ");
  const proofScore = resolveCandidateScore({
    integrity_score: profile.integrityScore,
  });

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-zinc-50">
      <header className="border-b border-zinc-800 bg-[#0A0A0A]/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between gap-4 px-6">
          <Link href="/" className="hover:opacity-90 transition-opacity duration-200">
            <ProvixLogo />
          </Link>
          <Link
            href="/login"
            className="text-xs font-semibold tracking-tight text-zinc-300 transition-colors duration-200 ease-out hover:text-white"
          >
            Sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-10">
        <Card className="overflow-hidden">
          <div className="border-b border-zinc-800 px-8 py-8">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-950 font-mono text-2xl font-bold text-zinc-300">
                {profile.initials}
              </div>

              <div className="min-w-0 flex-1 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-3xl font-extrabold tracking-tight text-white">
                    {profile.displayName}
                  </h1>
                  <VerifiedOnProvixPill verified={profile.isVerifiedOnProvix} />
                </div>
                <p className="font-mono text-xs font-medium text-zinc-400">
                  /p/{profile.profileSlug}
                </p>

                {profile.jobTitle && (
                  <p className="text-sm font-semibold text-indigo-300">
                    {profile.jobTitle}
                  </p>
                )}

                <WorkPreferenceTimezoneBadge
                  workPreference={profile.workPreference}
                  timezone={profile.timezone}
                />

                <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-300">
                  {profile.location && (
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5" aria-hidden />
                      {profile.location}
                    </span>
                  )}
                  {profile.experienceLevel && (
                    <span className="rounded-md border border-zinc-700 bg-zinc-950 px-2.5 py-1 font-mono text-[11px] uppercase tracking-wide text-zinc-200">
                      {profile.experienceLevel}
                    </span>
                  )}
                  {profile.availabilityStatus && (
                    <span
                      className={`rounded-md border px-2.5 py-1 font-mono text-[11px] uppercase tracking-wide ${getAvailabilityClass(profile.availabilityStatus)}`}
                    >
                      {profile.availabilityStatus}
                    </span>
                  )}
                  {profile.hasProofOfWork && proofScore != null && (
                    <div className="flex min-w-[4.5rem] flex-col gap-1.5">
                      <span className="font-mono text-sm tabular-nums text-zinc-300">
                        {proofScore}/100
                      </span>
                      <ScoreMeter score={proofScore} />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-8 px-8 py-8">
            {profile.bio && (
              <section>
                <h2 className="mb-3 text-[11px] font-bold uppercase tracking-widest text-zinc-400">
                  About
                </h2>
                <p className="max-w-3xl text-sm leading-relaxed text-zinc-200">
                  {profile.bio}
                </p>
              </section>
            )}

            {profile.skills.length > 0 && (
              <section>
                <h2 className="mb-3 text-[11px] font-bold uppercase tracking-widest text-zinc-400">
                  Skills
                </h2>
                <div className="flex flex-wrap gap-2">
                  {profile.skills.map((skill) => (
                    <span
                      key={skill}
                      className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-xs font-semibold text-zinc-100"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </section>
            )}

            <section>
              <h2 className="mb-3 text-[11px] font-bold uppercase tracking-widest text-zinc-400">
                Education & Credentials
              </h2>
              {academicLine || profile.school ? (
                <div className="flex items-start gap-3 rounded-2xl border border-zinc-800 bg-[#0A0A0A] p-4">
                  <GraduationCap
                    className="mt-0.5 h-4 w-4 shrink-0 text-indigo-400"
                    aria-hidden
                  />
                  <div className="min-w-0 space-y-2 text-sm text-zinc-200">
                    {profile.university || profile.school ? (
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-zinc-500 shrink-0">University</span>
                        <span className="text-right font-semibold text-white">
                          {profile.university || profile.school}
                        </span>
                      </div>
                    ) : null}
                    {profile.major ? (
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-zinc-500 shrink-0">Major</span>
                        <span className="text-right">{profile.major}</span>
                      </div>
                    ) : null}
                    {formatGpa(profile.gpa) ? (
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-zinc-500 shrink-0">GPA</span>
                        <span className="text-right font-mono">
                          {formatGpa(profile.gpa)}
                        </span>
                      </div>
                    ) : null}
                    {profile.graduationYear ? (
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-zinc-500 shrink-0">Graduation</span>
                        <span className="text-right">
                          Class of {profile.graduationYear}
                        </span>
                      </div>
                    ) : null}
                    {profile.school &&
                    profile.university &&
                    profile.school !== profile.university ? (
                      <p className="text-xs text-zinc-300">{profile.school}</p>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-zinc-700 bg-[#0A0A0A] px-4 py-6 text-sm text-zinc-400">
                  Education details will appear here once the candidate adds
                  school, major, GPA, or graduation year.
                </div>
              )}
            </section>

            <section>
              <h2 className="mb-3 text-[11px] font-bold uppercase tracking-widest text-zinc-400">
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
                      className="group flex items-center justify-between rounded-2xl border border-zinc-800 bg-[#0A0A0A] px-4 py-4 card-lift hover:border-indigo-400/50 hover:bg-indigo-500/5"
                    >
                      <span className="flex items-center gap-3">
                        <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700 bg-slate-900/80 text-slate-300">
                          <PlayCircle className="h-4 w-4" aria-hidden />
                        </span>
                        <span>
                          <span className="block text-sm font-semibold text-white">
                            Demo Video
                          </span>
                          <span className="block text-xs text-zinc-400">
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
                <div className="rounded-2xl border border-dashed border-zinc-700 bg-[#0A0A0A] px-4 py-6 text-sm text-zinc-400">
                  Proof-of-work links will appear here once the candidate adds
                  portfolio or demo artifacts.
                </div>
              )}
            </section>

            {profile.isVerifiedOnProvix ? (
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-5 py-4">
                <div className="flex items-start gap-3">
                  <ShieldCheck
                    className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300"
                    aria-hidden
                  />
                  <div>
                    <p className="text-sm font-semibold text-white">
                      Verified on Provix
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-zinc-300">
                      This profile is complete and a GitHub integrity audit has
                      run successfully. Employers hire on a contingency placement
                      model with no upfront subscriptions.{" "}
                      {PUBLIC_PLACEMENT_TERMS_SUMMARY}
                    </p>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </Card>
      </main>
    </div>
  );
}
