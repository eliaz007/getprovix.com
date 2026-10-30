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

export function getAvailabilityClass(status: string | null): string {
  if (status === "Available Now") {
    return "bg-emerald-500/10 text-emerald-300 border-emerald-500/25";
  }

  if (status === "Interviewing") {
    return "bg-amber-500/10 text-amber-300 border-amber-500/25";
  }

  return "bg-panel text-textMuted border-border";
}
