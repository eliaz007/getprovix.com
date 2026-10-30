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
import SelfTaughtEngineerBadge from "@/components/SelfTaughtEngineerBadge";
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
import type { PublicProfilePageProps } from "./publicprofilepageprops";

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
