"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  FileText,
  Flame,
  Lock,
  ShieldCheck,
  Sparkles,
  Target,
} from "lucide-react";
import type { CollegeFitResult } from "@/app/api/college-fit/route";
import RequestIntroModal from "@/components/RequestIntroModal";
import JobApplicantsDrawer, {
  type JobApplicantView,
} from "@/components/JobApplicantsDrawer";
import { useDashboardNav } from "@/components/dashboard/dashboard-nav-context";
import LockedContactDossierBadge from "@/components/LockedContactDossierBadge";
import VerifiedOnProvixPill from "@/components/VerifiedOnProvixPill";
import ShareProfileButton from "@/components/dashboard/ShareProfileButton";
import {
  buildCodenameAliasInputFromProfile,
  generateCodenameAlias,
} from "@/lib/alias-generator";
import {
  getPublicCandidateDisplayName,
  getPublicCandidateInitials,
  getPublicCandidateLocation,
  isIntroUnlockStatus,
  isIntroUnlockedForCandidate,
  splitFullName,
} from "@/lib/candidate-anonymization";
import { signOutAndClearSession } from "@/lib/sign-out";
import { buildProfileSlug } from "@/lib/profile-slug";
import { createClient } from "@/utils/supabase/client";
import {
  AVAILABILITY_STATUS_OPTIONS,
  DEFAULT_AVAILABILITY_STATUS,
  getAvailabilityBadgeClass,
  normalizeAvailabilityStatus,
  type AvailabilityStatus,
} from "@/lib/availability-status";
import {
  DEFAULT_EXPERIENCE_LEVEL,
  EXPERIENCE_LEVEL_OPTIONS,
  type ExperienceLevel,
} from "@/lib/experience-level";
import { formatSalaryRange } from "@/lib/format-salary-range";
import {
  getYouTubeUrlValidationMessage,
  isValidYouTubeUrl,
} from "@/lib/validate-youtube-url";
import {
  buildFallbackMatch,
  normalizeMatchResult,
  type MatchResult,
} from "@/lib/match-heuristic";
import {
  countActiveOpenings,
  countJobsMatchingCandidateSkills,
  isActiveJob,
  isVisibleToEmployers,
} from "@/lib/opportunities-metrics";
import { isPublishedVerifiedCandidateProfile } from "@/lib/published-candidate-profile";
import {
  DEFAULT_CANDIDATE_TIMEZONE,
  DEFAULT_WORK_PREFERENCE,
  TIMEZONE_OPTIONS,
  WORK_PREFERENCE_OPTIONS,
  normalizeCandidateTimezone,
  normalizeWorkPreference,
  type CandidateTimezone,
  type WorkPreference,
} from "@/lib/work-preference";
import WorkPreferenceTimezoneBadge from "@/components/WorkPreferenceTimezoneBadge";

const PROFILE_STORAGE_KEY = "vanguardx_profile_data";
const BUSINESS_PROFILE_STORAGE_KEY = "vanguardx_business_profile_data";
const BETA_UNLOCK_STORAGE_KEY = "beta_unlocked_session";
const BETA_LEAD_STORAGE_KEY = "beta_unlocked_lead";
const AUDIT_STORAGE_PREFIX = "vanguardx_audit_";

const DEEP_SCREENING_STAGES = [
  "Auditing GitHub repositories & branch structure...",
  "Verifying commit chronology & code authenticity...",
  "Synthesizing 1–100 score & founder interview rubrics...",
] as const;

const COLLEGE_FIT_STAGES = [
  "Analyzing academic stats...",
  "Evaluating reach & target programs...",
  "Building tailored strategy breakdown...",
] as const;

const DEFAULT_PROFILE_DATA = {
  name: "Alex Morgan",
  role: "Full-Stack Developer",
  bio: "Passionate about building fast Next.js apps and workflow automations.",
  school: "Stanford University",
  degree: "B.S. Computer Science",
  gpa: "3.9",
  gradYear: "2026",
  github: "github.com/alexm",
  demoVideo: "",
  projects: "1. Built a Next.js SaaS app with 500 users.\n2. Scaled a local agency's leads by 300% using automations."
};

const DEFAULT_BUSINESS_PROFILE_DATA = {
  businessName: "Acme Talent Partners",
  industry: "Software Engineering & Tech",
  companyBio: "We build fast, reliable software for high-growth startups — and we hire on proof, not polish.",
  workEmail: "hiring@acmetalent.com",
  phone: "+1 (555) 019-2231",
  billingPlan: "Free Plan"
};

// --- Comprehensive Minimalist UI Icons ---
const Icons = {
  Pen: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.89 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.89l12.683-12.683z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 7.125L16.862 4.487" />
    </svg>
  ),
  Banknotes: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  Building: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75z" />
    </svg>
  ),
  Document: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  ),
  Users: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
    </svg>
  ),
  Briefcase: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0" />
    </svg>
  ),
  User: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
    </svg>
  ),
  Link: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
    </svg>
  ),
  Save: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
    </svg>
  ),
  Check: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  ),
  XMark: () => (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
  Menu: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
    </svg>
  ),
  ExternalLink: () => (
    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
    </svg>
  ),
  Clipboard: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3a2.25 2.25 0 00-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
    </svg>
  ),
  Search: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
    </svg>
  ),
  Bookmark: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" />
    </svg>
  ),
  Radar: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.348 14.652a3.75 3.75 0 010-5.304m5.304 0a3.75 3.75 0 010 5.304m-7.425 2.121a6.75 6.75 0 010-9.546m9.546 0a6.75 6.75 0 010 9.546M5.106 18.894c-3.808-3.808-3.808-9.98 0-13.788m13.788 0c3.808 3.808 3.808 9.981 0 13.788M12 12h.008v.008H12V12z" />
    </svg>
  ),
  Compass: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
    </svg>
  ),
  GraduationCap: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.438 60.438 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.906 59.906 0 0112 3.493a59.903 59.903 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15.75l3 3m0 0l3-3m-3 3V9" />
    </svg>
  ),
  Mail: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
    </svg>
  ),
  Lock: () => (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
    </svg>
  ),
  LockSmall: () => (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
    </svg>
  ),
  Logout: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
    </svg>
  )
};

type DashboardTab =
  | "my_profile"
  | "opportunities"
  | "essay-studio"
  | "aid-appeals"
  | "college-fit"
  | "opportunity_radar"
  | "applications"
  | "talent"
  | "evaluator"
  | "revenue";

type ProfileRecord = {
  id: string | null;
  full_name: string | null;
  role: string | null;
  graduation_year: number | null;
  status?: string | null;
  major?: string | null;
  degree?: string | null;
  university?: string | null;
  job_title?: string | null;
  bio?: string | null;
  school?: string | null;
  skills?: string[] | null;
  portfolio_url?: string | null;
  youtube_url?: string | null;
  experience_level?: string | null;
  availability_status?: string | null;
  is_visible_in_pool?: boolean | null;
  company_name?: string | null;
  tier?: string | null;
  is_pro?: boolean | null;
  phone?: string | null;
  linkedin_url?: string | null;
  contact_email?: string | null;
  email?: string | null;
  name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  headline?: string | null;
  availability?: string | null;
  codename_alias?: string | null;
  profile_slug?: string | null;
  country?: string | null;
  timezone?: string | null;
  work_preference?: string | null;
  integrity_score?: number | null;
};

type InterviewCheatSheetQuestion = {
  question: string;
  category: string;
  what_to_listen_for: string;
};

type DeepScreeningResult = {
  integrity_score: number;
  timeline_flags: string[];
  artifact_analysis: string;
  technical_depth_summary: string;
  interview_questions: InterviewCheatSheetQuestion[];
  github_audit?: {
    repo_url: string;
    owner: string;
    repo: string;
    stars: number | null;
    forks: number | null;
    created_at: string | null;
    language: string | null;
    commit_count_sampled: number;
    commit_dates: string[];
    readme_excerpt: string | null;
    fetch_warnings: string[];
  } | null;
};

function getCandidateScreeningKey(candidate: TalentPoolCandidate): string {
  return candidate.profileId ?? candidate.id;
}

function parseStoredScreeningResult(raw: string): DeepScreeningResult | null {
  try {
    const parsed = JSON.parse(raw) as DeepScreeningResult;
    if (
      typeof parsed.integrity_score === "number" &&
      Array.isArray(parsed.timeline_flags) &&
      typeof parsed.artifact_analysis === "string"
    ) {
      return parsed;
    }
  } catch {
    // Ignore malformed cache entries.
  }
  return null;
}

function getIntegrityScoreClass(score: number): string {
  if (score >= 80) {
    return "text-emerald-400 border-emerald-500/30 bg-emerald-500/10";
  }
  if (score >= 60) {
    return "text-amber-400 border-amber-500/30 bg-amber-500/10";
  }
  return "text-red-400 border-red-500/30 bg-red-500/10";
}

type MatchInsight = MatchResult;

function resolveMatchInsight(
  raw: unknown,
  candidate: {
    title: string;
    bio: string;
    skills: string[];
    degree: string;
  },
  job: {
    title: string;
    company: string;
    tags: string[];
    location: string;
  }
): MatchInsight {
  if (raw && typeof raw === "object" && !("error" in (raw as object))) {
    const normalized = normalizeMatchResult(raw);
    if (Number.isFinite(normalized.match_percentage)) {
      const fallbackSkills = buildFallbackMatch(candidate, job);
      return {
        ...normalized,
        matching_skills:
          normalized.matching_skills.length > 0
            ? normalized.matching_skills
            : fallbackSkills.matching_skills,
        missing_skills:
          normalized.missing_skills.length > 0
            ? normalized.missing_skills
            : fallbackSkills.missing_skills,
      };
    }
  }

  return buildFallbackMatch(candidate, job);
}

function resolveProfileContactEmail(
  row: Pick<ProfileRecord, "contact_email" | "email">
): string | null {
  const contactEmail = row.contact_email?.trim();
  if (contactEmail) {
    return contactEmail;
  }

  const email = row.email?.trim();
  return email || null;
}

type CandidateProfileSaveInput = {
  fullName: string;
  jobTitle: string;
  bio: string;
  university: string;
  major: string;
  degree: string;
  skills: string[];
  portfolioUrl: string;
  youtubeUrl: string;
  experienceLevel: string;
  availabilityStatus: string;
  workPreference: string;
  candidateTimezone: string;
  isVisibleInPool: boolean;
  gradYear: string;
};

function buildCandidateProfileUpdatePayload(input: CandidateProfileSaveInput) {
  const parsedGradYear = Number.parseInt(input.gradYear, 10);

  return {
    full_name: input.fullName.trim() || null,
    job_title: input.jobTitle.trim() || null,
    bio: input.bio.trim() || null,
    university: input.university.trim() || null,
    major: input.major.trim() || null,
    degree: input.degree.trim() || null,
    skills: input.skills,
    portfolio_url: input.portfolioUrl.trim() || null,
    youtube_url: input.youtubeUrl.trim() || null,
    experience_level: input.experienceLevel,
    availability_status: normalizeAvailabilityStatus(input.availabilityStatus),
    work_preference: input.workPreference,
    timezone: input.candidateTimezone,
    is_visible_in_pool: input.isVisibleInPool,
    profile_slug: buildProfileSlug(input.fullName),
    graduation_year: Number.isFinite(parsedGradYear) ? parsedGradYear : null,
  };
}

async function persistCandidateProfile(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  payload: ReturnType<typeof buildCandidateProfileUpdatePayload>
) {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError) {
    return { data: null, error: sessionError };
  }

  if (!session?.user?.id) {
    return {
      data: null,
      error: { message: "No active session. Please sign in again." },
    };
  }

  if (session.user.id !== userId) {
    return {
      data: null,
      error: { message: "Session user does not match profile owner." },
    };
  }

  let attemptPayload: Record<
    string,
    string | number | boolean | string[] | null
  > = { ...payload };
  const optionalColumnKeys = [
    "availability_status",
    "experience_level",
    "university",
    "degree",
    "youtube_url",
    "profile_slug",
    "work_preference",
    "timezone",
  ] as const;

  for (let attempt = 0; attempt <= optionalColumnKeys.length; attempt++) {
    const { data, error } = await supabase
      .from("profiles")
      .update(attemptPayload)
      .eq("id", session.user.id)
      .select("*")
      .maybeSingle();

    if (!error) {
      return { data, error: null };
    }

    if (!isMissingColumnError(error) || attempt >= optionalColumnKeys.length) {
      return { data: null, error };
    }

    const keyToDrop = optionalColumnKeys[attempt];
    const { [keyToDrop]: _removed, ...rest } = attemptPayload;
    attemptPayload = rest;
  }

  return {
    data: null,
    error: { message: "Profile save failed after retries." },
  };
}

function isMissingColumnError(error: { message?: string; code?: string } | null) {
  if (!error) return false;
  return (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    (error.message?.includes("does not exist") ?? false)
  );
}

function isPaidEmployerPlan(billingPlan: string): boolean {
  const plan = billingPlan.trim().toLowerCase();
  if (!plan || plan === "free plan" || plan.includes("free tier")) {
    return false;
  }

  return (
    plan.includes("monthly") ||
    plan.includes("agency") ||
    plan.includes("$299") ||
    plan.includes("$149") ||
    plan.includes("$15") ||
    plan.includes("pro") ||
    plan.includes("paid") ||
    plan.includes("beta")
  );
}

function isProEmployer(
  profile: ProfileRecord | null,
  billingPlan: string
): boolean {
  if (profile?.is_pro === true) {
    return true;
  }

  const tier = profile?.tier?.trim().toLowerCase();
  if (tier === "pro") {
    return true;
  }

  return isPaidEmployerPlan(billingPlan);
}

function formatExternalUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) {
    return "";
  }

  return trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value
  );
}

type TalentPoolCandidate = {
  id: string;
  profileId?: string | null;
  name: string;
  fullName: string;
  profileName: string;
  firstName: string;
  lastName: string;
  headline: string;
  codenameAlias: string;
  country: string;
  timezone: string;
  workPreference: string;
  email?: string | null;
  phone?: string | null;
  linkedin_url?: string | null;
  github_url?: string | null;
  role: string;
  major: string;
  skills: string[];
  rating: string;
  execution_score?: number | string | null;
  status: string;
  experienceLevel: string;
  roleType: string;
  availability: string;
  bio: string;
  github: string;
  demoVideo: string;
  projects: string[];
};

function isEmployerRole(role: string | null | undefined): boolean {
  return role === "employer" || role === "business";
}

function isEmployeeRole(role: string | null | undefined): boolean {
  return role === "employee";
}

function canAccessTalentPool(role: string | null | undefined): boolean {
  if (!role || role === "employee" || role === "candidate") {
    return false;
  }
  return isEmployerRole(role);
}

function isProfileEligibleForTalentPool(row: ProfileRecord): boolean {
  return isPublishedVerifiedCandidateProfile(row);
}

function resolveProfileAvailability(
  row: Pick<ProfileRecord, "availability_status" | "availability">
): AvailabilityStatus {
  return normalizeAvailabilityStatus(
    row.availability_status ?? row.availability
  );
}

function candidateMatchesTalentSearch(
  candidate: TalentPoolCandidate,
  query: string
): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }

  const searchableValues = [
    candidate.codenameAlias,
    candidate.name,
    candidate.fullName,
    candidate.profileName,
    candidate.headline,
    candidate.bio,
    candidate.role,
    getPublicCandidateLocation(candidate),
    ...candidate.skills,
  ];

  return searchableValues.some((value) =>
    value.trim().toLowerCase().includes(normalizedQuery)
  );
}

function mapProfileRowToTalentCandidate(
  row: ProfileRecord & { id: string }
): TalentPoolCandidate {
  const skills = Array.isArray(row.skills)
    ? row.skills.filter((skill) => skill.trim())
    : [];
  const portfolioUrl = row.portfolio_url?.trim() ?? "";
  const isLinkedIn = portfolioUrl.toLowerCase().includes("linkedin");
  const shortId = row.id.replace(/-/g, "").slice(0, 3).toUpperCase();
  const resolvedName =
    row.full_name?.trim() ||
    row.name?.trim() ||
    row.codename_alias?.trim() ||
    "Candidate";
  const profileName = row.name?.trim() || "";
  const parsedName = splitFullName(resolvedName);
  const firstName = row.first_name?.trim() || parsedName.firstName;
  const lastName = row.last_name?.trim() || parsedName.lastName;
  const headline = row.job_title!.trim();
  const availability = resolveProfileAvailability(row);
  const codenameAlias =
    row.codename_alias?.trim() ||
    generateCodenameAlias(buildCodenameAliasInputFromProfile(row));
  const integrityScore =
    typeof row.integrity_score === "number" &&
    Number.isFinite(row.integrity_score)
      ? Math.round(row.integrity_score)
      : null;
  const major =
    row.major?.trim() ||
    row.degree?.trim() ||
    row.university?.trim() ||
    row.school?.trim() ||
    "";

  return {
    id: `C-${shortId}`,
    profileId: row.id,
    name: resolvedName,
    fullName: resolvedName,
    profileName,
    firstName,
    lastName,
    headline,
    codenameAlias,
    country: row.country?.trim() || "United States",
    timezone: normalizeCandidateTimezone(row.timezone),
    workPreference: normalizeWorkPreference(row.work_preference),
    email: resolveProfileContactEmail(row),
    phone: row.phone?.trim() || null,
    linkedin_url: row.linkedin_url?.trim() || (isLinkedIn ? portfolioUrl : null),
    github_url: !isLinkedIn && portfolioUrl ? portfolioUrl : null,
    role: headline,
    major,
    skills,
    rating: integrityScore !== null ? `${integrityScore}%` : "",
    execution_score: integrityScore,
    status: availability,
    experienceLevel:
      row.experience_level?.trim() || DEFAULT_EXPERIENCE_LEVEL,
    roleType: "General",
    availability,
    bio: row.bio!.trim(),
    github: portfolioUrl || "",
    demoVideo: row.youtube_url?.trim() || "",
    projects: [],
  };
}

function getCandidateProfileLink(candidate: TalentPoolCandidate): string | null {
  const linkedin = candidate.linkedin_url?.trim();
  if (linkedin) {
    return formatExternalUrl(linkedin);
  }

  const github =
    candidate.github_url?.trim() ||
    candidate.github?.trim() ||
    null;

  return github ? formatExternalUrl(github) : null;
}

function getCandidateProjectLinks(
  candidate: TalentPoolCandidate
): Array<{ label: string; url: string }> {
  const links: Array<{ label: string; url: string }> = [];

  const github =
    candidate.github_url?.trim() || candidate.github?.trim() || "";
  if (github) {
    links.push({
      label: github.includes("github.com") ? "GitHub" : "Portfolio",
      url: formatExternalUrl(github),
    });
  }

  const linkedin = candidate.linkedin_url?.trim() || "";
  if (linkedin) {
    links.push({
      label: "LinkedIn",
      url: formatExternalUrl(linkedin),
    });
  }

  const demo = candidate.demoVideo?.trim() || "";
  if (demo) {
    links.push({
      label: "Demo Reel",
      url: formatExternalUrl(demo),
    });
  }

  return links;
}

function getCandidateInitials(name: string): string {
  return (
    name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "??"
  );
}

function formatBaselineMatchLabel(
  executionScore: number | string | null | undefined,
  fallbackRating?: string
): string {
  if (typeof executionScore === "number" && Number.isFinite(executionScore)) {
    return `${Math.round(executionScore)}% Match`;
  }

  if (typeof executionScore === "string" && executionScore.trim()) {
    const trimmed = executionScore.trim();
    if (trimmed.toLowerCase().includes("match")) {
      return trimmed;
    }
    const numeric = Number.parseInt(trimmed.replace("%", ""), 10);
    return Number.isFinite(numeric) ? `${numeric}% Match` : trimmed;
  }

  if (fallbackRating?.trim()) {
    const trimmed = fallbackRating.trim();
    const numeric = Number.parseInt(trimmed.replace("%", ""), 10);
    return Number.isFinite(numeric) ? `${numeric}% Match` : trimmed;
  }

  return "94% Match";
}

type MatchingJob = {
  id: string;
  title: string;
  company?: string | null;
  tags?: string[] | null;
  location?: string | null;
};

function buildTalentMatchKey(candidateId: string, jobId: string | null) {
  return `${candidateId}:${jobId ?? "default"}`;
}

async function fetchProfileRow(
  supabase: ReturnType<typeof createClient>,
  userId: string
) {
  return supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
}

async function ensureUserProfile(
  supabase: ReturnType<typeof createClient>,
  user: User
): Promise<ProfileRecord | null> {
  const existing = await fetchProfileRow(supabase, user.id);

  if (!existing.error && existing.data) {
    return existing.data as ProfileRecord;
  }

  if (existing.error) {
    console.warn(
      "Profile fetch failed — creating fallback profile:",
      existing.error.message
    );
  }

  const fullName =
    displayNameFromSources(null, user) ||
    user.email?.split("@")[0] ||
    "New User";
  const role = resolveAccountRole(null, user) ?? "candidate";

  const extendedPayload = {
    id: user.id,
    full_name: fullName,
    role,
    is_visible_in_pool: true,
  };

  let upsertResult = await supabase
    .from("profiles")
    .upsert(extendedPayload, { onConflict: "id" })
    .select("*")
    .maybeSingle();

  if (upsertResult.error && isMissingColumnError(upsertResult.error)) {
    upsertResult = await supabase
      .from("profiles")
      .upsert(
        { id: user.id, full_name: fullName, role },
        { onConflict: "id" }
      )
      .select("*")
      .maybeSingle();
  }

  if (upsertResult.error) {
    console.error("Fallback profile upsert failed:", upsertResult.error.message);
    return null;
  }

  return (upsertResult.data as ProfileRecord | null) ?? null;
}

function displayNameFromSources(
  profile: ProfileRecord | null,
  user: User | null
): string {
  const fromTable = profile?.full_name?.trim() ?? "";
  if (fromTable) return fromTable;

  const meta = user?.user_metadata ?? {};
  const fromMeta = [meta.first_name, meta.last_name]
    .filter((part) => typeof part === "string" && part.trim())
    .join(" ")
    .trim();
  return fromMeta;
}

function resolveAccountRole(
  profile: ProfileRecord | null,
  user: User | null
): string | null {
  const fromProfile = profile?.role?.trim() || null;
  const fromMeta =
    typeof user?.user_metadata?.role === "string"
      ? user.user_metadata.role.trim()
      : null;
  return fromProfile ?? fromMeta;
}

export default function DashboardPage() {
  const router = useRouter();
  const {
    activeTab,
    setActiveTab,
    setMobileNavOpen,
    setAccountRole: setNavAccountRole,
    setOnOpenJobApplicants,
  } = useDashboardNav();

  const [showPublicProfile, setShowPublicProfile] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [proUpgradeModalOpen, setProUpgradeModalOpen] = useState(false);
  const [betaCompanyName, setBetaCompanyName] = useState("");
  const [betaWorkEmail, setBetaWorkEmail] = useState("");
  const [betaAccessSubmitting, setBetaAccessSubmitting] = useState(false);
  const [betaAccessError, setBetaAccessError] = useState<string | null>(null);
  const [betaAccessUnlocked, setBetaAccessUnlocked] = useState(false);
  const [introModalCandidate, setIntroModalCandidate] =
    useState<TalentPoolCandidate | null>(null);
  const [introDefaultRoleTitle, setIntroDefaultRoleTitle] = useState("");
  const [applicantsDrawerJob, setApplicantsDrawerJob] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [unlockedCandidateIds, setUnlockedCandidateIds] = useState<Set<string>>(
    new Set()
  );
  const [deepScreeningLoading, setDeepScreeningLoading] = useState(false);
  const [deepScreeningResult, setDeepScreeningResult] =
    useState<DeepScreeningResult | null>(null);
  const [deepScreeningStage, setDeepScreeningStage] = useState(0);
  const [deepScreeningError, setDeepScreeningError] = useState<string | null>(
    null
  );
  const [deepScreeningShowResults, setDeepScreeningShowResults] = useState(false);
  const deepScreeningIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null
  );
  const deepScreeningAbortRef = useRef<AbortController | null>(null);
  const [postJobModalOpen, setPostJobModalOpen] = useState(false);
  const [newJobTitle, setNewJobTitle] = useState("");
  const [newJobCompany, setNewJobCompany] = useState("");
  const [newJobLocation, setNewJobLocation] = useState("");
  const [newJobSalaryRange, setNewJobSalaryRange] = useState("");
  const [newJobTags, setNewJobTags] = useState("");
  const [isCreatingJob, setIsCreatingJob] = useState(false);
  const [appOrigin, setAppOrigin] = useState("");

  // Profile data — client auth gate; middleware refreshes SSR cookies.
  const [user, setUser] = useState<User | null>(null);
  const [dbProfile, setDbProfile] = useState<ProfileRecord | null>(null);
  const [accountRole, setAccountRole] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [jobs, setJobs] = useState<any[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [appliedJobIds, setAppliedJobIds] = useState<string[]>([]);
  const [jobInterestCounts, setJobInterestCounts] = useState<
    Record<string, number>
  >({});
  const [matchInsights, setMatchInsights] = useState<Record<string, MatchInsight>>({});
  const [matchLoadingIds, setMatchLoadingIds] = useState<Record<string, boolean>>({});
  const matchFetchedRef = useRef<Set<string>>(new Set());
  const [talentMatchScores, setTalentMatchScores] = useState<
    Record<string, MatchInsight>
  >({});
  const [talentMatchLoadingIds, setTalentMatchLoadingIds] = useState<
    Record<string, boolean>
  >({});
  const talentMatchFetchedRef = useRef<Set<string>>(new Set());
  // Talent pool visibility — synced from profiles.is_visible_in_pool (visible to employers).
  const [isVisibleInPool, setIsVisibleInPool] = useState(false);

  // Prefer profiles.role, then auth user_metadata.role.
  const profileRole = accountRole ?? dbProfile?.role;
  const isBusinessAccount = isEmployerRole(profileRole);
  const isEmployeeAccount = isEmployeeRole(profileRole);
  const showTalentPoolNav = canAccessTalentPool(profileRole);
  const [candidates, setCandidates] = useState<TalentPoolCandidate[]>([]);
  const [talentPoolLoading, setTalentPoolLoading] = useState(false);

  useEffect(() => {
    setNavAccountRole(profileRole ?? null);
  }, [profileRole, setNavAccountRole]);

  useEffect(() => {
    const supabase = createClient();
    let isMounted = true;

    (async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        const {
          data: { user: authedUser },
          error: userError,
        } = await supabase.auth.getUser();

        if (!isMounted) return;

        if (userError) {
          console.error("Dashboard session check failed:", userError.message, {
            code: userError.code,
          });
        }

        const sessionUser = authedUser ?? session?.user ?? null;

        if (!sessionUser) {
          setAuthChecked(true);
          setLoadingProfile(false);
          router.replace("/login");
          return;
        }

        setUser(sessionUser);

        const profileRow = await ensureUserProfile(supabase, sessionUser);

        if (!isMounted) return;

        const profile = profileRow ?? null;
        const resolvedRole = resolveAccountRole(profile, sessionUser);
        let profileWithRole =
          profile && !profile.role && resolvedRole
            ? { ...profile, role: resolvedRole }
            : profile;

        const displayName = displayNameFromSources(profileWithRole, sessionUser);

        if (profileWithRole?.id && !profileWithRole.profile_slug?.trim()) {
          const profile_slug = buildProfileSlug(
            profileWithRole.full_name ?? displayName
          );

          const { data: slugRow, error: slugError } = await supabase
            .from("profiles")
            .update({ profile_slug })
            .eq("id", profileWithRole.id)
            .select("*")
            .maybeSingle();

          if (!slugError && slugRow) {
            profileWithRole = {
              ...profileWithRole,
              ...(slugRow as ProfileRecord),
            };
          } else if (!slugError) {
            profileWithRole = { ...profileWithRole, profile_slug };
          }
        }

        setDbProfile(profileWithRole);
        setAccountRole(resolvedRole);

        const loadedVisibleInPool = isVisibleToEmployers(
          profileWithRole?.is_visible_in_pool
        );
        setIsVisibleInPool(loadedVisibleInPool);

        const loadedName = displayName || DEFAULT_PROFILE_DATA.name;
        const loadedTitle = profileWithRole?.job_title ?? "";
        const loadedBio = profileWithRole?.bio ?? "";
        const loadedSchool =
          profileWithRole?.university ??
          profileWithRole?.school ??
          "";
        const loadedMajor = profileWithRole?.major ?? "";
        const loadedDegree =
          profileWithRole?.degree ??
          profileWithRole?.major ??
          "";
        const loadedSkills = Array.isArray(profileWithRole?.skills)
          ? profileWithRole.skills.join(", ")
          : "";
        const loadedPortfolioUrl = profileWithRole?.portfolio_url ?? "";
        const loadedYoutubeUrl = profileWithRole?.youtube_url ?? "";
        const loadedExperienceLevel =
          profileWithRole?.experience_level?.trim() || DEFAULT_EXPERIENCE_LEVEL;
        const loadedAvailabilityStatus = normalizeAvailabilityStatus(
          profileWithRole?.availability_status
        );
        const loadedWorkPreference = normalizeWorkPreference(
          profileWithRole?.work_preference
        );
        const loadedCandidateTimezone = normalizeCandidateTimezone(
          profileWithRole?.timezone
        );
        const loadedGradYear =
          profileWithRole?.graduation_year != null
            ? String(profileWithRole.graduation_year)
            : "";

        setTitle(loadedTitle);
        setBio(loadedBio);
        setSchool(loadedSchool);
        setDegree(loadedDegree);
        setSkills(loadedSkills);
        setPortfolioUrl(loadedPortfolioUrl);
        setExperienceLevel(loadedExperienceLevel as ExperienceLevel);
        setAvailabilityStatus(loadedAvailabilityStatus);
        setWorkPreference(loadedWorkPreference);
        setCandidateTimezone(loadedCandidateTimezone);

        const hydratedProfile = {
          ...DEFAULT_PROFILE_DATA,
          name: loadedName,
          role: loadedTitle,
          bio: loadedBio,
          school: loadedSchool,
          degree: loadedDegree,
          github: loadedPortfolioUrl,
          gradYear: loadedGradYear,
          demoVideo: loadedYoutubeUrl,
        };
        setProfileData(hydratedProfile);
        setSavedProfileData(hydratedProfile);
        setSavedCandidateProfile({
          fullName: loadedName,
          title: loadedTitle,
          bio: loadedBio,
          school: loadedSchool,
          degree: loadedDegree,
          skills: loadedSkills,
          portfolioUrl: loadedPortfolioUrl,
          experienceLevel: loadedExperienceLevel,
          availabilityStatus: loadedAvailabilityStatus,
          workPreference: loadedWorkPreference,
          candidateTimezone: loadedCandidateTimezone,
          visibleInPool: loadedVisibleInPool,
          gradYear: loadedGradYear,
          gpa: hydratedProfile.gpa,
          demoVideo: loadedYoutubeUrl,
          projects: hydratedProfile.projects,
        });

        if (profileWithRole?.company_name) {
          setBusinessProfileData((prev) => ({
            ...prev,
            businessName: profileWithRole.company_name as string,
          }));
          setSavedBusinessProfileData((prev) => ({
            ...prev,
            businessName: profileWithRole.company_name as string,
          }));
        }

        if (canAccessTalentPool(resolvedRole)) {
          setProfileSubMenu("companyInfo");
          setActiveTab("talent");
        } else if (isEmployeeRole(resolvedRole)) {
          setActiveTab("opportunities");
        }

        const { data: applicationRows, error: applicationsError } = await supabase
          .from("job_applications")
          .select("job_id, created_at, jobs(title, company, salary_range, location)")
          .eq("candidate_id", sessionUser.id)
          .order("created_at", { ascending: false });

        if (!isMounted) return;

        if (applicationsError) {
          console.error("Failed to fetch job applications:", applicationsError);
        } else {
          setAppliedJobIds((applicationRows ?? []).map((row) => row.job_id));
          setAppliedJobs(
            (applicationRows ?? []).map((row) => {
              const job = row.jobs as {
                title?: string | null;
                company?: string | null;
                salary_range?: string | null;
                location?: string | null;
              } | null;

              return {
                jobId: row.job_id,
                title: job?.title ?? "Open Role",
                company: job?.company ?? "—",
                salary: formatSalaryRange(job?.salary_range ?? "") || "—",
                location: job?.location ?? "—",
                status: "Interest Expressed",
                appliedAt: new Date(row.created_at).toLocaleDateString(
                  undefined,
                  { month: "short", day: "numeric", year: "numeric" }
                ),
              };
            })
          );
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("Dashboard profile load threw:", message, err);
      } finally {
        if (isMounted) {
          setAuthChecked(true);
          setLoadingProfile(false);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [router]);

  useEffect(() => {
    const supabase = createClient();
    let isMounted = true;

    const loadJobs = async () => {
      try {
        const { data, error } = await supabase.from("jobs").select("*");

        if (error) {
          throw error;
        }

        if (!isMounted) return;
        setJobs(data ?? []);
      } catch (err) {
        console.error("Failed to fetch jobs:", err);
        if (isMounted) setJobs([]);
      } finally {
        if (isMounted) setJobsLoading(false);
      }
    };

    void loadJobs();

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void loadJobs();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      isMounted = false;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (!isBusinessAccount || !user?.id) {
      return;
    }

    const employerJobIds = jobs
      .filter((job) => job.employer_id === user.id)
      .map((job) => job.id);

    if (employerJobIds.length === 0) {
      setJobInterestCounts({});
      return;
    }

    let isMounted = true;
    const supabase = createClient();

    (async () => {
      const { data, error } = await supabase
        .from("job_applications")
        .select("job_id")
        .in("job_id", employerJobIds);

      if (!isMounted) {
        return;
      }

      if (error) {
        console.error("Failed to fetch job interest counts:", error);
        return;
      }

      const counts: Record<string, number> = {};
      for (const row of data ?? []) {
        counts[row.job_id] = (counts[row.job_id] ?? 0) + 1;
      }
      setJobInterestCounts(counts);
    })();

    return () => {
      isMounted = false;
    };
  }, [isBusinessAccount, user?.id, jobs]);

  useEffect(() => {
    if (!isBusinessAccount || !user?.id) {
      return;
    }

    setBusinessListings(
      jobs
        .filter((job) => job.employer_id === user.id)
        .map((job) => ({
          id: job.id,
          title: job.title ?? "Untitled Role",
          department: "General",
          applicants: jobInterestCounts[job.id] ?? 0,
          status: job.status === "paused" ? "Paused" : "Active",
        }))
    );
  }, [isBusinessAccount, user?.id, jobs, jobInterestCounts]);

  useEffect(() => {
    if (!showTalentPoolNav) {
      setCandidates([]);
      setTalentPoolLoading(false);
      return;
    }

    const supabase = createClient();
    let isMounted = true;

    setTalentPoolLoading(true);

    (async () => {
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select(
            "id, full_name, name, first_name, last_name, job_title, headline, bio, skills, portfolio_url, youtube_url, experience_level, availability_status, availability, major, degree, university, school, role, is_visible_in_pool, codename_alias, country, timezone, work_preference, phone, linkedin_url, contact_email, email, integrity_score"
          )
          .eq("is_visible_in_pool", true);

        if (!isMounted) {
          return;
        }

        if (error) {
          console.error("Failed to fetch talent pool profiles:", error);
          setCandidates([]);
          return;
        }

        const mapped = await Promise.all(
          (data ?? [])
            .filter((row): row is ProfileRecord & { id: string } => !!row.id)
            .filter(isProfileEligibleForTalentPool)
            .map(async (row) => {
              let profileRow = row;

              if (!row.codename_alias?.trim()) {
                const codename_alias = generateCodenameAlias(
                  buildCodenameAliasInputFromProfile(row)
                );

                await supabase
                  .from("profiles")
                  .update({ codename_alias })
                  .eq("id", row.id);

                profileRow = { ...row, codename_alias };
              }

              return mapProfileRowToTalentCandidate(profileRow);
            })
        );

        setCandidates(mapped);
      } catch (err) {
        console.error("Talent pool fetch threw:", err);
        if (isMounted) {
          setCandidates([]);
        }
      } finally {
        if (isMounted) {
          setTalentPoolLoading(false);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [showTalentPoolNav]);

  const fetchIntroUnlocks = useCallback(async (userId: string) => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("intro_requests")
      .select("candidate_id, status")
      .eq("user_id", userId);

    if (error) {
      console.error("Intro unlock fetch error:", error);
      return;
    }

    const unlocked = new Set<string>();
    for (const row of data ?? []) {
      if (isIntroUnlockStatus(row.status)) {
        unlocked.add(row.candidate_id.trim().toLowerCase());
      }
    }

    setUnlockedCandidateIds(unlocked);
  }, []);

  useEffect(() => {
    if (!user?.id || !showTalentPoolNav) {
      return;
    }

    void fetchIntroUnlocks(user.id);
  }, [user?.id, showTalentPoolNav, fetchIntroUnlocks]);

  useEffect(() => {
    if (!showTalentPoolNav && activeTab === "talent") {
      setActiveTab(isEmployeeAccount ? "opportunities" : "my_profile");
    }
    if (
      !showTalentPoolNav &&
      (activeTab === "evaluator" || activeTab === "revenue")
    ) {
      setActiveTab(isEmployeeAccount ? "opportunities" : "my_profile");
    }
    if (
      !isEmployeeAccount &&
      (activeTab === "opportunity_radar" || activeTab === "applications")
    ) {
      setActiveTab("my_profile");
    }
    if (isBusinessAccount && activeTab === "opportunities") {
      setActiveTab("my_profile");
    }
  }, [showTalentPoolNav, isEmployeeAccount, isBusinessAccount, activeTab]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [activeTab, setMobileNavOpen]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setAppOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setMobileNavOpen(false);
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [setMobileNavOpen]);

  const handleSignOut = () => {
    window.location.href = "/";
    void signOutAndClearSession();
  };

const showToast = (msg: string) => {
  setToastMessage(msg);
  setTimeout(() => setToastMessage(null), 3000);
};

  const handleVisibilityToggle = () => {
    setIsVisibleInPool((current) => !current);
  };
  // --- SUB-MENU STATE FOR PROFILE TAB ---
  const [profileSubMenu, setProfileSubMenu] = useState<
    "overview" | "academics" | "portfolio" | "settings" | "companyInfo" | "activeListings"
  >("overview");

  // --- CANDIDATE PROFILE STUDIO STATE (persisted to Supabase) ---
  const [title, setTitle] = useState("");
  const [bio, setBio] = useState("");
  const [school, setSchool] = useState("");
  const [degree, setDegree] = useState("");
  const [skills, setSkills] = useState("");
  const [portfolioUrl, setPortfolioUrl] = useState("");
  const [experienceLevel, setExperienceLevel] = useState<ExperienceLevel>(
    DEFAULT_EXPERIENCE_LEVEL
  );
  const [availabilityStatus, setAvailabilityStatus] =
    useState<AvailabilityStatus>(DEFAULT_AVAILABILITY_STATUS);
  const [workPreference, setWorkPreference] = useState<WorkPreference>(
    DEFAULT_WORK_PREFERENCE
  );
  const [candidateTimezone, setCandidateTimezone] = useState<
    CandidateTimezone | string
  >(DEFAULT_CANDIDATE_TIMEZONE);
  const [isSaving, setIsSaving] = useState(false);
  const [savedCandidateProfile, setSavedCandidateProfile] = useState<{
    fullName: string;
    title: string;
    bio: string;
    school: string;
    degree: string;
    skills: string;
    portfolioUrl: string;
    experienceLevel: string;
    availabilityStatus: string;
    workPreference: string;
    candidateTimezone: string;
    visibleInPool: boolean;
    gradYear: string;
    gpa: string;
    demoVideo: string;
    projects: string;
  } | null>(null);

  // --- USER PROFILE DATA STATE (name + legacy portfolio fields) ---
  const [profileData, setProfileData] = useState(DEFAULT_PROFILE_DATA);
  const [savedProfileData, setSavedProfileData] = useState(DEFAULT_PROFILE_DATA);

  // Mirrors profileData/savedProfileData above, but for business accounts —
  // business name, industry, work email, and phone instead of dev credentials.
  const [businessProfileData, setBusinessProfileData] = useState(DEFAULT_BUSINESS_PROFILE_DATA);
  const [savedBusinessProfileData, setSavedBusinessProfileData] = useState(DEFAULT_BUSINESS_PROFILE_DATA);
  const employerCompanyNameForMatching =
    dbProfile?.company_name ||
    businessProfileData?.businessName ||
    "your company";
  const isProEmployerAccount =
    betaAccessUnlocked ||
    isProEmployer(dbProfile, businessProfileData.billingPlan);
  const hasBetaAccess = isProEmployerAccount;

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (window.localStorage.getItem(BETA_UNLOCK_STORAGE_KEY) === "true") {
      setBetaAccessUnlocked(true);
    }

    try {
      const storedLead = window.localStorage.getItem(BETA_LEAD_STORAGE_KEY);
      if (storedLead) {
        const parsed = JSON.parse(storedLead) as {
          company_name?: string;
          work_email?: string;
        };
        if (parsed.company_name) {
          setBetaCompanyName(parsed.company_name);
        }
        if (parsed.work_email) {
          setBetaWorkEmail(parsed.work_email);
        }
      }
    } catch {
      // Ignore malformed local lead cache.
    }
  }, []);

  useEffect(() => {
    if (!proUpgradeModalOpen) {
      return;
    }

    setBetaCompanyName(
      dbProfile?.company_name?.trim() ||
        businessProfileData.businessName?.trim() ||
        ""
    );
    setBetaWorkEmail(
      businessProfileData.workEmail?.trim() || user?.email?.trim() || ""
    );
  }, [
    proUpgradeModalOpen,
    dbProfile?.company_name,
    businessProfileData.businessName,
    businessProfileData.workEmail,
    user?.email,
  ]);

  const employerActiveJobs = useMemo(
    () => jobs.filter((job) => job.employer_id === user?.id),
    [jobs, user?.id]
  );
  const primaryMatchingJob = useMemo<MatchingJob | null>(() => {
    const selectedJob = employerActiveJobs[0] ?? null;

    if (!selectedJob) {
      return null;
    }

    return {
      id: selectedJob.id,
      title: selectedJob.title ?? "Open Role",
      company: selectedJob.company ?? employerCompanyNameForMatching,
      tags: Array.isArray(selectedJob.tags) ? selectedJob.tags : [],
      location: selectedJob.location ?? "",
    };
  }, [employerActiveJobs, employerCompanyNameForMatching]);

  const isCandidateDirty =
    savedCandidateProfile !== null &&
    (profileData.name !== savedCandidateProfile.fullName ||
      title !== savedCandidateProfile.title ||
      bio !== savedCandidateProfile.bio ||
      school !== savedCandidateProfile.school ||
      degree !== savedCandidateProfile.degree ||
      skills !== savedCandidateProfile.skills ||
      portfolioUrl !== savedCandidateProfile.portfolioUrl ||
      experienceLevel !== savedCandidateProfile.experienceLevel ||
      availabilityStatus !== savedCandidateProfile.availabilityStatus ||
      workPreference !== savedCandidateProfile.workPreference ||
      candidateTimezone !== savedCandidateProfile.candidateTimezone ||
      isVisibleInPool !== savedCandidateProfile.visibleInPool ||
      profileData.gradYear !== savedCandidateProfile.gradYear ||
      profileData.gpa !== savedCandidateProfile.gpa ||
      profileData.demoVideo !== savedCandidateProfile.demoVideo ||
      profileData.projects !== savedCandidateProfile.projects);

  const isDirty = isBusinessAccount
    ? JSON.stringify(businessProfileData) !== JSON.stringify(savedBusinessProfileData)
    : isCandidateDirty;

  const hasUnsavedChanges = isDirty;
  const demoVideoValidationMessage = getYouTubeUrlValidationMessage(
    profileData.demoVideo
  );
  const isDemoVideoValid = isValidYouTubeUrl(profileData.demoVideo);
  const canSaveProfile =
    hasUnsavedChanges &&
    (isBusinessAccount || isDemoVideoValid) &&
    !isSaving;

  // Hydrate business profile data from LocalStorage once the component mounts on the client.
  useEffect(() => {
    try {
      const storedBusiness = window.localStorage.getItem(BUSINESS_PROFILE_STORAGE_KEY);
      if (storedBusiness) {
        const parsedBusiness = { ...DEFAULT_BUSINESS_PROFILE_DATA, ...JSON.parse(storedBusiness) };
        setBusinessProfileData(parsedBusiness);
        setSavedBusinessProfileData(parsedBusiness);
      }
    } catch {
      // Ignore corrupted or inaccessible storage (e.g. private browsing)
    }
  }, []);

  const handleSaveProfile = async () => {
    if (isSaving || !hasUnsavedChanges) return;
    if (!isBusinessAccount && !isDemoVideoValid) return;

    if (isBusinessAccount) {
      try {
        window.localStorage.setItem(
          BUSINESS_PROFILE_STORAGE_KEY,
          JSON.stringify(businessProfileData)
        );
      } catch {
        // Storage unavailable — the in-memory state still reflects the change
      }
      setSavedBusinessProfileData(businessProfileData);
      showToast("Profile changes saved successfully!");
      return;
    }

    const profileId = dbProfile?.id ?? user?.id;
    if (!profileId) {
      showToast("You must be logged in to save your profile.");
      return;
    }

    setIsSaving(true);

    try {
      const supabase = createClient();
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session?.user?.id) {
        console.error("Profile update failed:", sessionError);
        showToast("You must be logged in to save your profile.");
        return;
      }

      const skillsArray = (skills ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const normalizedAvailability = normalizeAvailabilityStatus(
        availabilityStatus
      );
      const academicMajor = degree.trim();
      const payload = buildCandidateProfileUpdatePayload({
        fullName: profileData.name,
        jobTitle: title,
        bio,
        university: school,
        major: academicMajor,
        degree: academicMajor,
        skills: skillsArray,
        portfolioUrl,
        youtubeUrl: profileData.demoVideo,
        experienceLevel,
        availabilityStatus: normalizedAvailability,
        workPreference,
        candidateTimezone,
        isVisibleInPool,
        gradYear: profileData.gradYear,
      });

      const { data, error } = await persistCandidateProfile(
        supabase,
        session.user.id,
        payload
      );

      if (error) {
        console.error("Profile update failed:", error);
        showToast("Could not save profile. Please try again.");
        return;
      }

      if (data) {
        setDbProfile((prev) =>
          prev
            ? {
                ...prev,
                ...(data as ProfileRecord),
                is_visible_in_pool: isVisibleInPool,
                availability_status: normalizedAvailability,
              }
            : (data as ProfileRecord)
        );
      }

      const snapshot = {
        fullName: profileData.name,
        title,
        bio,
        school,
        degree,
        skills,
        portfolioUrl,
        experienceLevel,
        availabilityStatus: normalizedAvailability,
        workPreference,
        candidateTimezone,
        visibleInPool: isVisibleInPool,
        gradYear: profileData.gradYear,
        gpa: profileData.gpa,
        demoVideo: profileData.demoVideo,
        projects: profileData.projects,
      };
      setSavedCandidateProfile(snapshot);
      setSavedProfileData({
        ...profileData,
        role: title,
        bio,
        school,
        degree,
        github: portfolioUrl,
      });
      setAvailabilityStatus(normalizedAvailability);
      showToast("Profile saved successfully.");
    } catch (error) {
      console.error("Profile update failed:", error);
      showToast("Could not save profile. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const updateDemoVideo = (value: string) => {
    setProfileData((prev) => ({
      ...prev,
      demoVideo: value,
    }));
  };

  const handleDemoVideoChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    updateDemoVideo(event.target.value);
  };

  const handleDemoVideoPaste = (
    event: React.ClipboardEvent<HTMLInputElement>
  ) => {
    const pastedText = event.clipboardData.getData("text");
    if (!pastedText) {
      return;
    }

    event.preventDefault();
    updateDemoVideo(pastedText);
  };

  // --- EMPLOYER JOB LISTINGS STATE (Business accounts only) ---
  const [businessListings, setBusinessListings] = useState<
    Array<{
      id: string;
      title: string;
      department: string;
      applicants: number;
      status: string;
    }>
  >([]);

  const toggleListingStatus = async (id: string) => {
    const listing = businessListings.find((entry) => entry.id === id);
    if (!listing) {
      return;
    }

    const nextStatus = listing.status === "Active" ? "paused" : "active";
    const previousListings = businessListings;
    const previousJobs = jobs;

    setBusinessListings((prev) =>
      prev.map((entry) =>
        entry.id === id
          ? {
              ...entry,
              status: nextStatus === "active" ? "Active" : "Paused",
            }
          : entry
      )
    );
    setJobs((prev) =>
      prev.map((job) =>
        job.id === id ? { ...job, status: nextStatus } : job
      )
    );

    try {
      const response = await fetch(`/api/jobs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });

      const payload = (await response.json()) as {
        error?: string;
        job?: { id: string; status?: string | null };
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Could not update listing status.");
      }

      if (payload.job) {
        setJobs((prev) =>
          prev.map((job) => (job.id === id ? { ...job, ...payload.job } : job))
        );
      }

      showToast(
        nextStatus === "paused"
          ? "Listing deactivated. It is hidden from other accounts."
          : "Listing reactivated."
      );
    } catch (error) {
      console.error("Job status update failed:", error);
      setBusinessListings(previousListings);
      setJobs(previousJobs);
      showToast("Could not update listing status. Please try again.");
    }
  };

  // --- COLLEGE ADMISSIONS STATE ---
  const [essayTargetSchool, setEssayTargetSchool] = useState("");
  const [essayPrompt, setEssayPrompt] = useState("");
  const [essayText, setEssayText] = useState("");
  const [evaluatingEssay, setEvaluatingEssay] = useState(false);
  const [essayReview, setEssayReview] = useState<{
    overallScore: number;
    verdict: string;
    strengths: string[];
    improvements: string[];
    lineFeedback: {
      originalText: string;
      suggestion: string;
      reason: string;
    }[];
  } | null>(null);
  
  const [collegeName, setCollegeName] = useState("");
  const [currentOffer, setCurrentOffer] = useState("");
  const [appealReason, setAppealReason] = useState("Financial Hardship");
  const [contextDetails, setContextDetails] = useState("");
  const [generatingAid, setGeneratingAid] = useState(false);
  const [aidAppealResult, setAidAppealResult] = useState<{
    strategyScore: "Strong Leverage" | "Moderate Leverage" | "Needs Evidence";
    strategyAnalysis: string;
    requiredDocuments: string[];
    negotiationDosAndDonts: string[];
    letterSubject: string;
    letterBody: string;
  } | null>(null);
  const [checkedDocuments, setCheckedDocuments] = useState<Record<string, boolean>>({});
  const [letterCopied, setLetterCopied] = useState(false);

  const [fitGpa, setFitGpa] = useState("");
  const [fitTestScores, setFitTestScores] = useState("");
  const [fitMajor, setFitMajor] = useState("");
  const [fitLocationPreference, setFitLocationPreference] = useState("");
  const [fitBudgetPreference, setFitBudgetPreference] = useState("");
  const [generatingCollegeFit, setGeneratingCollegeFit] = useState(false);
  const [collegeFitReport, setCollegeFitReport] = useState<CollegeFitResult | null>(
    null
  );
  const [collegeFitStage, setCollegeFitStage] = useState(0);
  const [collegeFitError, setCollegeFitError] = useState<string | null>(null);
  const collegeFitIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null
  );
  const collegeFitAbortRef = useRef<AbortController | null>(null);

  // --- EMPLOYER SCREENING STATE ---
  const [evalRole, setEvalRole] = useState("");
  const [evalMajor, setEvalMajor] = useState("");
  const [evalAccomplishments, setEvalAccomplishments] = useState("");
  const [evaluatingPoW, setEvaluatingPoW] = useState(false);
  const [powResult, setPowResult] = useState(false);

  const [appliedJobs, setAppliedJobs] = useState<
    Array<{
      jobId: string;
      title: string;
      company: string;
      salary: string;
      location: string;
      status: string;
      appliedAt: string;
    }>
  >([]);

  // --- EMPLOYEE OPPORTUNITY RADAR STATE ---
  const [radarSearch, setRadarSearch] = useState("");
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [radarExperienceFilter, setRadarExperienceFilter] = useState("all");
  const [savedOpportunityIds, setSavedOpportunityIds] = useState<string[]>([]);
  const [opportunitiesSearch, setOpportunitiesSearch] = useState("");
  const [opportunitiesRemoteOnly, setOpportunitiesRemoteOnly] = useState(false);
  const [talentSearch, setTalentSearch] = useState("");
  const [experienceFilter, setExperienceFilter] = useState("all");
  const [roleTypeFilter, setRoleTypeFilter] = useState("all");
  const [availabilityFilter, setAvailabilityFilter] = useState("all");
  const [selectedCandidate, setSelectedCandidate] =
    useState<TalentPoolCandidate | null>(null);

  useEffect(() => {
    if (!selectedCandidate) {
      setDeepScreeningResult(null);
      setDeepScreeningShowResults(false);
      setDeepScreeningError(null);
      setDeepScreeningLoading(false);
      setDeepScreeningStage(0);
      return;
    }

    const screeningKey = getCandidateScreeningKey(selectedCandidate);
    let cancelled = false;

    const applyCachedResult = () => {
      if (typeof window === "undefined") {
        return false;
      }

      const cached = localStorage.getItem(`${AUDIT_STORAGE_PREFIX}${screeningKey}`);
      if (!cached) {
        return false;
      }

      const parsed = parseStoredScreeningResult(cached);
      if (!parsed) {
        return false;
      }

      if (!cancelled) {
        setDeepScreeningResult(parsed);
        setDeepScreeningShowResults(true);
      }
      return true;
    };

    setDeepScreeningError(null);
    setDeepScreeningLoading(false);
    setDeepScreeningStage(0);

    if (applyCachedResult()) {
      return () => {
        cancelled = true;
      };
    }

    setDeepScreeningResult(null);
    setDeepScreeningShowResults(false);

    void (async () => {
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("candidate_screenings")
          .select("audit_data")
          .eq("candidate_key", screeningKey)
          .maybeSingle();

        if (cancelled) {
          return;
        }

        if (!error && data?.audit_data) {
          const audit = data.audit_data as DeepScreeningResult;
          setDeepScreeningResult(audit);
          setDeepScreeningShowResults(true);
          if (typeof window !== "undefined") {
            localStorage.setItem(
              `${AUDIT_STORAGE_PREFIX}${screeningKey}`,
              JSON.stringify(audit)
            );
          }
          return;
        }

        applyCachedResult();
      } catch (err) {
        console.error("Failed to load persisted screening:", err);
        if (!cancelled) {
          applyCachedResult();
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedCandidate?.id]);

  const filteredCandidates = candidates.filter((candidate) => {
    const matchesSearch = candidateMatchesTalentSearch(
      candidate,
      talentSearch
    );

    const matchesExperience =
      experienceFilter === "all" ||
      candidate.experienceLevel === experienceFilter;
    const matchesRoleType =
      roleTypeFilter === "all" || candidate.roleType === roleTypeFilter;
    const matchesAvailability =
      availabilityFilter === "all" ||
      normalizeAvailabilityStatus(candidate.availability) ===
        availabilityFilter;

    return (
      matchesSearch && matchesExperience && matchesRoleType && matchesAvailability
    );
  });

  const profileViewsCount = 28;

  const handleSaveOpportunity = (opportunityId: string, title: string) => {
    setSavedOpportunityIds((prev) => {
      const isSaved = prev.includes(opportunityId);
      if (isSaved) {
        showToast(`Removed ${title} from saved roles.`);
        return prev.filter((id) => id !== opportunityId);
      }
      showToast(`Saved ${title} to your radar.`);
      return [...prev, opportunityId];
    });
  };

  const getMatchBadgeClass = (matchPercent: number) => {
    if (matchPercent >= 90) {
      return "bg-emerald-500/10 text-emerald-400 border border-emerald-500/25";
    }
    if (matchPercent >= 80) {
      return "bg-indigo-500/10 text-indigo-400 border border-indigo-500/25";
    }
    return "bg-amber-500/10 text-amber-400 border border-amber-500/25";
  };

  const isJobVisibleInFeed = isActiveJob;

  const candidateSkillsForMatching = useMemo(() => {
    if (Array.isArray(dbProfile?.skills) && dbProfile.skills.length > 0) {
      return dbProfile.skills;
    }

    return (skills ?? "")
      .split(",")
      .map((skill) => skill.trim())
      .filter(Boolean);
  }, [dbProfile?.skills, skills]);

  const activeOpeningsCount = useMemo(
    () => countActiveOpenings(jobs),
    [jobs]
  );

  const skillMatchingJobsCount = useMemo(
    () => countJobsMatchingCandidateSkills(jobs, candidateSkillsForMatching),
    [jobs, candidateSkillsForMatching]
  );

  const profileVisibleToEmployers = isVisibleToEmployers(
    dbProfile?.is_visible_in_pool
  );

  const filteredJobFeed = jobs.filter((job) => {
    if (!isJobVisibleInFeed(job)) {
      return false;
    }

    const query = opportunitiesSearch.trim().toLowerCase();
    const tags = Array.isArray(job.tags) ? job.tags : [];
    const matchesSearch =
      !query ||
      (job.title ?? "").toLowerCase().includes(query) ||
      (job.company ?? "").toLowerCase().includes(query) ||
      tags.some((tag: string) => tag.toLowerCase().includes(query));
    const matchesRemote =
      !opportunitiesRemoteOnly ||
      (job.location ?? "").toLowerCase().includes("remote");

    return matchesSearch && matchesRemote;
  });

  const filteredRadarJobFeed = jobs.filter((job) => {
    if (!isJobVisibleInFeed(job)) {
      return false;
    }

    const query = radarSearch.trim().toLowerCase();
    const tags = Array.isArray(job.tags) ? job.tags : [];
    const matchesSearch =
      !query ||
      (job.title ?? "").toLowerCase().includes(query) ||
      (job.company ?? "").toLowerCase().includes(query) ||
      tags.some((tag: string) => tag.toLowerCase().includes(query));
    const matchesRemote =
      !remoteOnly || (job.location ?? "").toLowerCase().includes("remote");

    return matchesSearch && matchesRemote;
  });

  const radarDirectMatchesCount = filteredRadarJobFeed.filter((job) => {
    const insight = matchInsights[job.id];
    return (insight?.match_percentage ?? 0) >= 90;
  }).length;

  const liveMatchingCount = Object.values(matchInsights).filter(
    (insight) => insight.match_percentage >= 80
  ).length;
  const isMatchEvaluating = Object.values(matchLoadingIds).some(Boolean);

  useEffect(() => {
    if (jobsLoading || jobs.length === 0 || isBusinessAccount) {
      return;
    }

    const candidateSkills = (skills ?? "")
      .split(",")
      .map((skill) => skill.trim())
      .filter(Boolean);

    const candidatePayload = {
      title: title.trim() || profileData.role || "",
      bio: bio.trim() || profileData.bio || "",
      skills: candidateSkills,
      degree: degree.trim() || profileData.degree || "",
    };

    const pendingJobs = jobs.filter(
      (job) => isJobVisibleInFeed(job) && !matchInsights[job.id]
    );

    if (pendingJobs.length === 0) {
      return;
    }

    setMatchLoadingIds((prev) => {
      const next = { ...prev };
      for (const job of pendingJobs) {
        next[job.id] = true;
      }
      return next;
    });

    let cancelled = false;

    void Promise.all(
      pendingJobs.map(async (job) => {
        const jobPayload = {
          title: job.title ?? "",
          company: job.company ?? "",
          tags: Array.isArray(job.tags) ? job.tags : [],
          location: job.location ?? "",
        };

        try {
          const response = await fetch("/api/match", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              candidate: candidatePayload,
              job: jobPayload,
            }),
          });

          const raw = (await response.json()) as unknown;
          const insight = resolveMatchInsight(
            raw,
            candidatePayload,
            jobPayload
          );

          if (cancelled) return;

          setMatchInsights((prev) => ({
            ...prev,
            [job.id]: insight,
          }));
          matchFetchedRef.current.add(job.id);
        } catch (err) {
          console.error(`Failed to fetch match for job ${job.id}:`, err);
          if (cancelled) return;

          setMatchInsights((prev) => ({
            ...prev,
            [job.id]: buildFallbackMatch(candidatePayload, jobPayload),
          }));
        } finally {
          setMatchLoadingIds((prev) => ({
            ...prev,
            [job.id]: false,
          }));
        }
      })
    );

    return () => {
      cancelled = true;
    };
  }, [
    activeTab,
    isBusinessAccount,
    jobs,
    jobsLoading,
    title,
    bio,
    skills,
    degree,
    profileData.role,
    profileData.bio,
    profileData.degree,
  ]);

  useEffect(() => {
    talentMatchFetchedRef.current.clear();
    setTalentMatchScores({});
    setTalentMatchLoadingIds({});
  }, [primaryMatchingJob?.id, employerActiveJobs.length]);

  useEffect(() => {
    if (
      activeTab !== "talent" ||
      !showTalentPoolNav ||
      !user?.id ||
      employerActiveJobs.length === 0 ||
      !primaryMatchingJob
    ) {
      return;
    }

    const jobIdForStorage = isUuid(primaryMatchingJob.id)
      ? primaryMatchingJob.id
      : null;
    let cancelled = false;

    void (async () => {
      const supabase = createClient();

      let cacheQuery = supabase
        .from("talent_match_scores")
        .select(
          "candidate_id, match_percentage, reasoning, matching_skills, missing_skills"
        )
        .eq("employer_id", user.id);

      cacheQuery = jobIdForStorage
        ? cacheQuery.eq("job_id", jobIdForStorage)
        : cacheQuery.is("job_id", null);

      const { data: cachedRows, error: cacheError } = await cacheQuery;

      if (cacheError) {
        console.error("Failed to load talent match scores:", cacheError);
      }

      if (cancelled) return;

      const cachedByCandidate: Record<string, MatchInsight> = {};
      for (const row of cachedRows ?? []) {
        cachedByCandidate[row.candidate_id] = {
          match_percentage: row.match_percentage,
          reasoning: row.reasoning ?? "",
          matching_skills: row.matching_skills ?? [],
          missing_skills: row.missing_skills ?? [],
        };
        talentMatchFetchedRef.current.add(
          buildTalentMatchKey(row.candidate_id, jobIdForStorage)
        );
      }

      if (Object.keys(cachedByCandidate).length > 0) {
        setTalentMatchScores((prev) => ({ ...prev, ...cachedByCandidate }));
      }

      const pendingCandidates = candidates.filter((candidate) => {
        const key = buildTalentMatchKey(candidate.id, jobIdForStorage);
        return !talentMatchFetchedRef.current.has(key);
      });

      if (pendingCandidates.length === 0) {
        return;
      }

      pendingCandidates.forEach((candidate) => {
        talentMatchFetchedRef.current.add(
          buildTalentMatchKey(candidate.id, jobIdForStorage)
        );
      });

      setTalentMatchLoadingIds((prev) => {
        const next = { ...prev };
        for (const candidate of pendingCandidates) {
          next[candidate.id] = true;
        }
        return next;
      });

      void Promise.all(
        pendingCandidates.map(async (candidate) => {
          const candidatePayload = {
            title: candidate.role,
            bio: candidate.bio ?? "",
            skills: candidate.skills,
            degree: candidate.major,
          };
          const jobPayload = {
            title: primaryMatchingJob.title,
            company: primaryMatchingJob.company ?? "",
            tags: primaryMatchingJob.tags ?? [],
            location: primaryMatchingJob.location ?? "",
          };

          try {
            const response = await fetch("/api/match", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                candidate: candidatePayload,
                job: jobPayload,
              }),
            });

            const raw = (await response.json()) as unknown;
            const data = resolveMatchInsight(raw, candidatePayload, jobPayload);
            if (cancelled) return;

            setTalentMatchScores((prev) => ({
              ...prev,
              [candidate.id]: data,
            }));

            const { error: saveError } = await supabase
              .from("talent_match_scores")
              .upsert(
                {
                  employer_id: user.id,
                  candidate_id: candidate.id,
                  job_id: jobIdForStorage,
                  match_percentage: data.match_percentage,
                  reasoning: data.reasoning,
                  matching_skills: data.matching_skills,
                  missing_skills: data.missing_skills,
                  updated_at: new Date().toISOString(),
                },
                { onConflict: "employer_id,candidate_id,job_id" }
              );

            if (saveError) {
              console.error("Failed to save talent match score:", saveError);
            }
          } catch (err) {
            console.error(
              `Failed to fetch talent match for ${candidate.id}:`,
              err
            );
            if (cancelled) return;

            setTalentMatchScores((prev) => ({
              ...prev,
              [candidate.id]: buildFallbackMatch(candidatePayload, jobPayload),
            }));
          } finally {
            setTalentMatchLoadingIds((prev) => ({
              ...prev,
              [candidate.id]: false,
            }));
          }
        })
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [
    activeTab,
    showTalentPoolNav,
    user?.id,
    primaryMatchingJob,
    employerActiveJobs.length,
    candidates,
  ]);

  const handleExpressInterestToJob = async (job: (typeof jobs)[number]) => {
    if (!user?.id) {
      showToast("You must be logged in to express interest.");
      return;
    }

    if (appliedJobIds.includes(job.id)) {
      return;
    }

    setAppliedJobIds((prev) => [...prev, job.id]);
    setAppliedJobs((prev) => [
      {
        jobId: job.id,
        title: job.title ?? "Open Role",
        company: job.company ?? "—",
        salary: formatSalaryRange(job.salary_range ?? "") || "—",
        location: job.location ?? "—",
        status: "Interest Expressed",
        appliedAt: "Just now",
      },
      ...prev,
    ]);
    showToast(
      "Interest submitted. The team will review your proof-of-work dossier."
    );

    const supabase = createClient();
    const { error } = await supabase.from("job_applications").insert({
      job_id: job.id,
      candidate_id: user.id,
    });

    if (error) {
      console.error("Failed to submit job interest:", error);
      setAppliedJobIds((prev) => prev.filter((id) => id !== job.id));
      setAppliedJobs((prev) =>
        prev.filter((application) => application.jobId !== job.id)
      );

      if (error.code === "23505") {
        setAppliedJobIds((prev) =>
          prev.includes(job.id) ? prev : [...prev, job.id]
        );
        return;
      }

      showToast("Could not submit interest. Please try again.");
      return;
    }

    const employerId = job.employer_id as string | undefined;
    if (employerId && employerId !== user.id) {
      const alias = getCandidateNotificationAlias();
      const jobTitle = job.title ?? "Open Role";
      const { error: notificationError } = await supabase
        .from("notifications")
        .insert({
          user_id: employerId,
          job_id: job.id,
          message: `${alias} expressed interest in your role: ${jobTitle}`,
          is_read: false,
        });

      if (notificationError) {
        console.error("Failed to create employer notification:", notificationError);
      }
    }
  };

  const handleExpressInterest = (job: (typeof jobs)[number]) => {
    void handleExpressInterestToJob(job);
  };

  const savedProfilesCount = 8;
  const scoredTalentMatches = Object.values(talentMatchScores).filter(
    (score) => score.match_percentage >= 80
  ).length;
  const newMatchesCount =
    scoredTalentMatches > 0
      ? scoredTalentMatches
      : candidates.filter(
          (candidate) => candidate.availability === "Available Now"
        ).length;

  const getTalentMatchLabel = (candidate: TalentPoolCandidate) => {
    const insight = talentMatchScores[candidate.id];
    if (insight) {
      return `${insight.match_percentage}% Match`;
    }

    if (
      typeof candidate.execution_score === "number" &&
      candidate.execution_score > 0
    ) {
      return formatBaselineMatchLabel(
        candidate.execution_score,
        candidate.rating
      );
    }

    return "Match pending";
  };

  const openIntroModal = (candidate: TalentPoolCandidate) => {
    setIntroDefaultRoleTitle("");
    setIntroModalCandidate(candidate);
  };

  const openApplicantsDrawer = (listing: {
    id: string;
    title: string;
    applicants: number;
  }) => {
    if (listing.applicants <= 0) {
      return;
    }

    setApplicantsDrawerJob({ id: listing.id, title: listing.title });
  };

  const openApplicantsDrawerForJob = useCallback(
    (jobId: string) => {
      const job = jobs.find((entry) => entry.id === jobId);
      const listing = businessListings.find((entry) => entry.id === jobId);

      router.push("/dashboard");
      setActiveTab("my_profile");
      setProfileSubMenu("activeListings");
      setApplicantsDrawerJob({
        id: jobId,
        title: job?.title ?? listing?.title ?? "Role",
      });
    },
    [jobs, businessListings, router, setActiveTab]
  );

  useEffect(() => {
    setOnOpenJobApplicants(openApplicantsDrawerForJob);
    return () => setOnOpenJobApplicants(null);
  }, [openApplicantsDrawerForJob, setOnOpenJobApplicants]);

  const getCandidateNotificationAlias = useCallback((): string => {
    if (dbProfile?.codename_alias?.trim()) {
      return dbProfile.codename_alias.trim();
    }

    const skillTags = (skills ?? "")
      .split(",")
      .map((skill) => skill.trim())
      .filter(Boolean);

    return generateCodenameAlias(
      buildCodenameAliasInputFromProfile({
        id: user?.id ?? "candidate",
        job_title: title || dbProfile?.job_title,
        headline: dbProfile?.headline,
        major: dbProfile?.major,
        skills: skillTags.length > 0 ? skillTags : dbProfile?.skills,
      })
    );
  }, [dbProfile, skills, title, user?.id]);

  const handleApplicantIntroRequest = (applicant: JobApplicantView) => {
    const roleTitle = applicantsDrawerJob?.title ?? applicant.headline;
    const parsedScore = Number.parseInt(
      applicant.aiScoreLabel.replace(/\D/g, ""),
      10
    );
    const codename = applicant.codenameAlias;
    const introCandidate: TalentPoolCandidate = {
      id: `C-${applicant.profileId.replace(/-/g, "").slice(0, 3).toUpperCase()}`,
      profileId: applicant.profileId,
      name: codename,
      fullName: codename,
      profileName: codename,
      firstName: codename.split(/\s+/)[0] ?? codename,
      lastName: codename.split(/\s+/).slice(1).join(" "),
      headline: applicant.headline,
      codenameAlias: codename,
      country: applicant.location,
      timezone: applicant.location,
      role: applicant.headline,
      major: "Credentials on file",
      skills: applicant.skills,
      rating: applicant.aiScoreLabel,
      execution_score: Number.isFinite(parsedScore) ? parsedScore : 94,
      status: "Available Now",
      experienceLevel: DEFAULT_EXPERIENCE_LEVEL,
      roleType: "General",
      availability: "Available Now",
      bio: "Candidate expressed interest in this role via Provix.",
      github: "",
      demoVideo: "",
      projects: [],
    };

    setApplicantsDrawerJob(null);
    setIntroDefaultRoleTitle(roleTitle);
    setIntroModalCandidate(introCandidate);
  };

  const handleIntroRequestSuccess = () => {
    if (user?.id) {
      void fetchIntroUnlocks(user.id);
    }

    showToast(
      "Intro request submitted. Our team will review it under Provix placement terms."
    );
  };

  const getCandidatePublicName = (candidate: TalentPoolCandidate) =>
    getPublicCandidateDisplayName({
      codenameAlias: candidate.codenameAlias,
      firstName: candidate.firstName,
      lastName: candidate.lastName,
      fullName: candidate.fullName,
      candidateId: candidate.profileId ?? candidate.id,
    });

  const getCandidatePublicInitials = (candidate: TalentPoolCandidate) =>
    getPublicCandidateInitials({
      codenameAlias: candidate.codenameAlias,
      firstName: candidate.firstName,
      lastName: candidate.lastName,
      fullName: candidate.fullName,
      candidateId: candidate.profileId ?? candidate.id,
    });

  const getCandidatePublicLocation = (candidate: TalentPoolCandidate) =>
    getPublicCandidateLocation(candidate);

  const isCandidateUnlocked = (candidate: TalentPoolCandidate) =>
    isIntroUnlockedForCandidate(candidate, unlockedCandidateIds);

  const handleUnlockBetaAccess = async () => {
    const companyName = betaCompanyName.trim();
    const workEmail = betaWorkEmail.trim();
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!companyName || !workEmail) {
      setBetaAccessError("Company name and work email are required.");
      return;
    }

    if (!emailPattern.test(workEmail)) {
      setBetaAccessError("Enter a valid work email address.");
      return;
    }

    setBetaAccessError(null);
    setBetaAccessSubmitting(true);

    const applyBetaUnlockLocal = () => {
      setBetaAccessUnlocked(true);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(BETA_UNLOCK_STORAGE_KEY, "true");
        window.localStorage.setItem(
          BETA_LEAD_STORAGE_KEY,
          JSON.stringify({
            company_name: companyName,
            work_email: workEmail,
          })
        );
      }

      setDbProfile((prev) =>
        prev
          ? {
              ...prev,
              is_pro: true,
              tier: "pro",
              company_name: companyName,
            }
          : prev
      );
      setBusinessProfileData((prev) => ({
        ...prev,
        businessName: companyName,
        workEmail,
        billingPlan: "Beta Access",
      }));
      setSavedBusinessProfileData((prev) => ({
        ...prev,
        businessName: companyName,
        workEmail,
        billingPlan: "Beta Access",
      }));
      setProUpgradeModalOpen(false);
      showToast("Beta access active! Deep screening unlocked.");
    };

    try {
      const response = await fetch("/api/beta-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_name: companyName,
          work_email: workEmail,
        }),
      });

      const data = (await response.json()) as {
        error?: string;
        success?: boolean;
        unlocked?: boolean;
        warnings?: string[];
      };

      if (response.status === 400) {
        setBetaAccessError(data.error ?? "Enter a valid work email address.");
        return;
      }

      if (response.status === 401) {
        setBetaAccessError("Sign in again to unlock beta access.");
        return;
      }

      if (!response.ok || !data.success) {
        throw new Error(data.error ?? "Could not unlock beta access.");
      }

      applyBetaUnlockLocal();

      if (data.warnings?.length) {
        console.warn("[beta-access] unlock warnings:", data.warnings);
      }
    } catch (err) {
      console.error("Beta access unlock failed:", err);
      applyBetaUnlockLocal();
      showToast(
        "Beta access active locally. We could not fully sync with Supabase."
      );
    } finally {
      setBetaAccessSubmitting(false);
    }
  };

  const handleCopyInterviewQuestion = async (question: string) => {
    try {
      await navigator.clipboard.writeText(question);
      showToast("Interview question copied.");
    } catch {
      showToast("Could not copy question.");
    }
  };

  const clearDeepScreeningTimers = () => {
    if (deepScreeningIntervalRef.current) {
      clearInterval(deepScreeningIntervalRef.current);
      deepScreeningIntervalRef.current = null;
    }
    deepScreeningAbortRef.current?.abort();
    deepScreeningAbortRef.current = null;
  };

  const runDeepScreening = async () => {
    if (!selectedCandidate) {
      return;
    }

    if (!isProEmployerAccount) {
      setProUpgradeModalOpen(true);
      return;
    }

    const screeningJob = primaryMatchingJob ?? {
      title: selectedCandidate.role || "General Talent Evaluation",
      company: employerCompanyNameForMatching,
      tags: selectedCandidate.skills.slice(0, 8),
      location: "",
    };

    clearDeepScreeningTimers();
    setDeepScreeningLoading(true);
    setDeepScreeningError(null);
    setDeepScreeningShowResults(false);
    setDeepScreeningResult(null);
    setDeepScreeningStage(0);

    deepScreeningIntervalRef.current = setInterval(() => {
      setDeepScreeningStage((prev) => (prev < DEEP_SCREENING_STAGES.length - 1 ? prev + 1 : prev));
    }, 1400);

    const controller = new AbortController();
    deepScreeningAbortRef.current = controller;
    const timeoutId = window.setTimeout(() => controller.abort(), 45000);
    const screeningKey = getCandidateScreeningKey(selectedCandidate);

    try {
      const response = await fetch("/api/screen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          candidate: {
            name: selectedCandidate.name,
            title: selectedCandidate.role,
            bio: selectedCandidate.bio,
            skills: selectedCandidate.skills,
            degree: selectedCandidate.major,
            experience: selectedCandidate.experienceLevel,
            projects: selectedCandidate.projects,
            github_url:
              selectedCandidate.github_url ?? selectedCandidate.github ?? "",
            github: selectedCandidate.github ?? "",
          },
          job: {
            title: screeningJob.title,
            company: screeningJob.company,
            tags: screeningJob.tags,
            location: screeningJob.location,
          },
          candidate_key: screeningKey,
          profile_id: selectedCandidate.profileId ?? undefined,
        }),
      });

      if (!response.ok) {
        throw new Error(`Deep screening failed (${response.status})`);
      }

      const data = (await response.json()) as DeepScreeningResult;
      setDeepScreeningStage(DEEP_SCREENING_STAGES.length - 1);
      await new Promise((resolve) => window.setTimeout(resolve, 450));
      setDeepScreeningResult(data);
      setDeepScreeningShowResults(true);
      if (typeof window !== "undefined") {
        localStorage.setItem(
          `${AUDIT_STORAGE_PREFIX}${screeningKey}`,
          JSON.stringify(data)
        );
      }
    } catch (err) {
      console.error("Deep screening request failed:", err);
      const isTimeout =
        err instanceof DOMException && err.name === "AbortError";
      setDeepScreeningError(
        isTimeout
          ? "The live audit timed out before Gemini could finish. Please retry."
          : "Could not complete the live audit. Check your connection and retry."
      );
      setDeepScreeningShowResults(false);
      showToast("Deep screening failed. Use retry to run the audit again.");
    } finally {
      window.clearTimeout(timeoutId);
      clearDeepScreeningTimers();
      setDeepScreeningLoading(false);
    }
  };

  const isDrawerOpen = selectedCandidate !== null;

  // Simulators
  const runEssayAudit = async () => {
    if (!essayPrompt.trim() || !essayText.trim()) {
      showToast("Add a college prompt and essay draft before analyzing.");
      return;
    }

    setEvaluatingEssay(true);
    setEssayReview(null);

    try {
      const response = await fetch("/api/essay-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: essayPrompt.trim(),
          draft: essayText.trim(),
          targetSchool: essayTargetSchool.trim() || undefined,
        }),
      });

      if (!response.ok) {
        throw new Error(`Essay review failed (${response.status})`);
      }

      const data = await response.json();
      setEssayReview(data);
    } catch (err) {
      console.error("Essay review request failed:", err);
      showToast("Could not analyze essay. Please try again.");
    } finally {
      setEvaluatingEssay(false);
    }
  };

  const essayWordCount = essayText.trim()
    ? essayText.trim().split(/\s+/).filter(Boolean).length
    : 0;

  const clearCollegeFitTimers = () => {
    if (collegeFitIntervalRef.current) {
      clearInterval(collegeFitIntervalRef.current);
      collegeFitIntervalRef.current = null;
    }
    collegeFitAbortRef.current?.abort();
    collegeFitAbortRef.current = null;
  };

  const generateCollegeFitReport = async () => {
    if (!fitGpa.trim() || !fitMajor.trim()) {
      showToast("Enter your GPA and intended major to generate a fit report.");
      return;
    }

    clearCollegeFitTimers();
    setGeneratingCollegeFit(true);
    setCollegeFitReport(null);
    setCollegeFitError(null);
    setCollegeFitStage(0);

    collegeFitIntervalRef.current = setInterval(() => {
      setCollegeFitStage((prev) =>
        prev < COLLEGE_FIT_STAGES.length - 1 ? prev + 1 : prev
      );
    }, 1400);

    const controller = new AbortController();
    collegeFitAbortRef.current = controller;
    const timeoutId = window.setTimeout(() => controller.abort(), 45000);

    try {
      const response = await fetch("/api/college-fit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          gpa: fitGpa.trim(),
          major: fitMajor.trim(),
          testScores: fitTestScores.trim() || undefined,
          locationPreference: fitLocationPreference.trim() || undefined,
          budgetPreference: fitBudgetPreference.trim() || undefined,
        }),
      });

      if (!response.ok) {
        throw new Error(`College fit request failed (${response.status})`);
      }

      const data = (await response.json()) as CollegeFitResult;
      setCollegeFitStage(COLLEGE_FIT_STAGES.length - 1);
      await new Promise((resolve) => window.setTimeout(resolve, 450));
      setCollegeFitReport(data);
    } catch (err) {
      console.error("College fit request failed:", err);
      const isTimeout =
        err instanceof DOMException && err.name === "AbortError";
      setCollegeFitError(
        isTimeout
          ? "The fit report timed out before Gemini could finish. Please retry."
          : "Could not generate fit report. Check your connection and retry."
      );
      showToast("Could not generate fit report. Please try again.");
    } finally {
      window.clearTimeout(timeoutId);
      clearCollegeFitTimers();
      setGeneratingCollegeFit(false);
    }
  };

  const generateAidAppeal = async () => {
    if (!collegeName.trim() || !appealReason.trim() || !contextDetails.trim()) {
      showToast("Add college name, appeal reason, and detailed notes.");
      return;
    }

    setGeneratingAid(true);
    setAidAppealResult(null);
    setCheckedDocuments({});
    setLetterCopied(false);

    try {
      const response = await fetch("/api/aid-appeal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          collegeName: collegeName.trim(),
          currentOffer: currentOffer.trim() || undefined,
          appealReason: appealReason.trim(),
          contextDetails: contextDetails.trim(),
        }),
      });

      if (!response.ok) {
        throw new Error(`Aid appeal failed (${response.status})`);
      }

      const data = await response.json();
      setAidAppealResult(data);
    } catch (err) {
      console.error("Aid appeal request failed:", err);
      showToast("Could not generate appeal letter. Please try again.");
    } finally {
      setGeneratingAid(false);
    }
  };

  const copyAppealLetter = async () => {
    if (!aidAppealResult) return;

    const fullLetter = `Subject: ${aidAppealResult.letterSubject}\n\n${aidAppealResult.letterBody}`;

    try {
      await navigator.clipboard.writeText(fullLetter);
      setLetterCopied(true);
      showToast("Appeal letter copied to clipboard.");
      setTimeout(() => setLetterCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy appeal letter:", err);
      showToast("Could not copy letter. Please try again.");
    }
  };

  const getStrategyBadgeClass = (
    score: "Strong Leverage" | "Moderate Leverage" | "Needs Evidence"
  ) => {
    if (score === "Strong Leverage") {
      return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
    }
    if (score === "Moderate Leverage") {
      return "bg-indigo-500/10 text-indigo-400 border-indigo-500/20";
    }
    return "bg-amber-500/10 text-amber-400 border-amber-500/20";
  };

  const toggleDocumentChecked = (document: string) => {
    setCheckedDocuments((prev) => ({
      ...prev,
      [document]: !prev[document],
    }));
  };

  const evaluateCandidate = () => {
    setEvaluatingPoW(true);
    setTimeout(() => { setPowResult(true); setEvaluatingPoW(false); }, 1500);
  };

  // --- DERIVED VALUES FOR THE SHAREABLE PUBLIC PROFILE MODAL ---
  const profileInitials = profileData?.name
    ?.split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "??";

  const projectLines = (profileData?.projects ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const featuredProjectTitle = projectLines[0] || "No projects added yet";
  const featuredProjectDetail = projectLines[1] || bio;

  const profileSlug =
    dbProfile?.profile_slug?.trim() ||
    buildProfileSlug(profileData?.name) ||
    "builder";
  const publicProfileUrl = appOrigin
    ? `${appOrigin}/p/${profileSlug}`
    : `/p/${profileSlug}`;

  // --- DERIVED VALUES FOR THE SHAREABLE BUSINESS PROFILE CARD ---
  const businessInitials =
    businessProfileData?.businessName
      ?.split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "??";
  const activeRolesCount = businessListings.filter((listing) => listing.status === "Active").length;
  const employerCompanyName =
    dbProfile?.company_name ||
    businessProfileData?.businessName ||
    "your company";

  const resetNewJobForm = () => {
    setNewJobTitle("");
    setNewJobLocation("");
    setNewJobSalaryRange("");
    setNewJobTags("");
    setNewJobCompany(employerCompanyName);
  };

  const openPostJobModal = () => {
    setNewJobCompany(employerCompanyName);
    setPostJobModalOpen(true);
  };

  const handleCreateJob = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user?.id || isCreatingJob) return;

    if (!newJobTitle.trim()) {
      showToast("Job title is required.");
      return;
    }

    setIsCreatingJob(true);
    const supabase = createClient();
    const tagsArray = (newJobTags ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const { data, error } = await supabase
      .from("jobs")
      .insert({
        title: newJobTitle.trim(),
        company: newJobCompany.trim() || null,
        location: newJobLocation.trim() || null,
        salary_range: formatSalaryRange(newJobSalaryRange.trim()) || null,
        tags: tagsArray,
        employer_id: user.id,
      })
      .select("*")
      .single();

    setIsCreatingJob(false);

    if (error) {
      console.error("Create job error:", JSON.stringify(error, null, 2));
      showToast("Could not post job. Please try again.");
      return;
    }

    if (data) {
      setJobs((prev) => [data, ...prev]);
    }

    setPostJobModalOpen(false);
    resetNewJobForm();
    showToast("Job posted successfully!");
  };

  const businessSlug =
    businessProfileData?.businessName
      ?.toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "company";
  const publicBusinessProfileUrl = appOrigin
    ? `${appOrigin}/c/${businessSlug}`
    : `/c/${businessSlug}`;

  const candidateStatus =
    dbProfile?.status ||
    (typeof user?.user_metadata?.status === "string"
      ? user.user_metadata.status
      : "") ||
    "";
  const isHighSchoolStudent = candidateStatus === "High School Student";
  const majorLabel = isHighSchoolStudent
    ? "Intended Major / Academic Interest"
    : "Major / Specialization";

  if (!authChecked) {
    return <div className="min-h-screen bg-[#0A0A0A]" aria-busy="true" />;
  }

  if (!user) {
    return null;
  }

  if (loadingProfile) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <p className="text-sm text-slate-500">Loading...</p>
      </div>
    );
  }

  const renderProfileFormActions = (options?: { showShareLink?: boolean }) => (
    <div className="mt-6 pt-6 border-t border-slate-800/60 flex flex-col sm:flex-row gap-3">
      <button
        type="button"
        onClick={handleSaveProfile}
        disabled={!canSaveProfile}
        className={`w-full sm:flex-1 font-bold py-3 rounded-xl text-xs transition-all flex items-center justify-center gap-2 ${
          canSaveProfile
            ? "bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer shadow-lg shadow-indigo-500/25"
            : "bg-slate-800 text-slate-500 cursor-not-allowed"
        }`}
      >
        {isSaving ? null : hasUnsavedChanges ? <Icons.Save /> : <Icons.Check />}
        {isSaving
          ? "Saving..."
          : hasUnsavedChanges
            ? "Save Changes"
            : "No Unsaved Changes"}
      </button>
      {options?.showShareLink && isBusinessAccount && (
        <button
          type="button"
          onClick={() => setShowPublicProfile(true)}
          className="w-full sm:w-auto bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold px-4 py-3 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer"
        >
          <Icons.Link /> Share Profile Link
        </button>
      )}
    </div>
  );

  return (
    <>
      {isEmployeeAccount && activeTab === "opportunity_radar" && (
        <div className="sticky top-0 z-20 -mt-4 mb-2 flex justify-center pointer-events-none">
          <div
            className={`inline-flex items-center gap-2 backdrop-blur-md text-xs font-bold px-4 py-2 rounded-full shadow-lg border ${
              isVisibleInPool
                ? "bg-[#111111]/95 border-emerald-500/25 text-emerald-400"
                : "bg-[#111111]/95 border-slate-700 text-slate-400"
            }`}
          >
            {isVisibleInPool
              ? "🟢 Open to Work (Visible to Employers)"
              : "🔴 Profile Hidden from Employers"}
          </div>
        </div>
      )}
      <div className="w-full max-w-5xl mx-auto space-y-10 animate-in fade-in duration-500 transition-all duration-300">

          {/* MY PROFILE TAB WITH NESTED MENU OPTIONS */}
          {activeTab === "my_profile" && (
            <div className="max-w-3xl">
              <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h1 className="text-3xl font-extrabold tracking-tight text-white">
                    Profile Studio
                  </h1>
                  <p className="text-slate-400 text-sm mt-2 max-w-2xl leading-relaxed">
                    {isBusinessAccount
                      ? "Manage your company profile, hiring requirements, and account settings."
                      : "Manage your credentials, academic status, and proof of work."}
                  </p>
                </div>
                {!isBusinessAccount && (
                  <ShareProfileButton profileSlug={profileSlug} />
                )}
              </div>

              {/* HORIZONTAL SUB-MENU BAR */}
              <div className="flex border-b border-slate-800/80 mb-8 space-x-6">
                {isBusinessAccount ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setProfileSubMenu("companyInfo")}
                      className={`pb-3 text-xs font-bold transition-all relative cursor-pointer ${
                        profileSubMenu === "companyInfo"
                          ? "text-indigo-400 border-b-2 border-indigo-500"
                          : "text-slate-500 hover:text-slate-300"
                      }`}
                    >
                      Company Info
                    </button>
                    <button
                      type="button"
                      onClick={() => setProfileSubMenu("activeListings")}
                      className={`pb-3 text-xs font-bold transition-all relative cursor-pointer ${
                        profileSubMenu === "activeListings"
                          ? "text-indigo-400 border-b-2 border-indigo-500"
                          : "text-slate-500 hover:text-slate-300"
                      }`}
                    >
                      Active Listings
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setProfileSubMenu("overview")}
                      className={`pb-3 text-xs font-bold transition-all relative cursor-pointer ${
                        profileSubMenu === "overview"
                          ? "text-indigo-400 border-b-2 border-indigo-500"
                          : "text-slate-500 hover:text-slate-300"
                      }`}
                    >
                      Overview & Bio
                    </button>
                    <button
                      type="button"
                      onClick={() => setProfileSubMenu("academics")}
                      className={`pb-3 text-xs font-bold transition-all relative cursor-pointer ${
                        profileSubMenu === "academics"
                          ? "text-indigo-400 border-b-2 border-indigo-500"
                          : "text-slate-500 hover:text-slate-300"
                      }`}
                    >
                      Academics & Major
                    </button>
                    <button
                      type="button"
                      onClick={() => setProfileSubMenu("portfolio")}
                      className={`pb-3 text-xs font-bold transition-all relative cursor-pointer ${
                        profileSubMenu === "portfolio"
                          ? "text-indigo-400 border-b-2 border-indigo-500"
                          : "text-slate-500 hover:text-slate-300"
                      }`}
                    >
                      Proof of Work
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => setProfileSubMenu("settings")}
                  className={`pb-3 text-xs font-bold transition-all relative cursor-pointer ${
                    profileSubMenu === "settings"
                      ? "text-indigo-400 border-b-2 border-indigo-500"
                      : "text-slate-500 hover:text-slate-300"
                  }`}
                >
                  Account Settings
                </button>
              </div>

              {/* SUB-MENU CONTENT PANELS */}
              <div className="bg-[#111111] rounded-2xl border border-slate-800/60 p-8 shadow-2xl">
                {profileSubMenu === "companyInfo" && (
                  <div className="space-y-6 animate-in fade-in">
                    <div className="flex items-center gap-5 pb-6 border-b border-slate-800">
                      <div className="w-16 h-16 rounded-2xl bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-xl font-bold text-indigo-400">
                        {businessProfileData?.businessName?.charAt(0) || "?"}
                      </div>
                      <div className="flex-1">
                        <input
                          type="text"
                          value={businessProfileData.businessName}
                          onChange={(e) =>
                            setBusinessProfileData({
                              ...businessProfileData,
                              businessName: e.target.value,
                            })
                          }
                          className="w-full bg-transparent font-bold text-2xl text-white focus:outline-none border-b border-transparent focus:border-indigo-500 pb-1"
                        />
                        <input
                          type="text"
                          value={businessProfileData.industry}
                          onChange={(e) =>
                            setBusinessProfileData({
                              ...businessProfileData,
                              industry: e.target.value,
                            })
                          }
                          className="w-full bg-transparent text-xs text-indigo-400 font-medium focus:outline-none border-b border-transparent focus:border-indigo-500 pb-1 mt-1"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-400 mb-2 uppercase">
                          Work Email
                        </label>
                        <input
                          type="text"
                          value={businessProfileData.workEmail}
                          onChange={(e) =>
                            setBusinessProfileData({
                              ...businessProfileData,
                              workEmail: e.target.value,
                            })
                          }
                          className="w-full bg-[#0A0A0A] border border-slate-800 rounded-xl p-3 text-sm text-white font-mono focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-400 mb-2 uppercase">
                          Phone
                        </label>
                        <input
                          type="text"
                          value={businessProfileData.phone}
                          onChange={(e) =>
                            setBusinessProfileData({
                              ...businessProfileData,
                              phone: e.target.value,
                            })
                          }
                          className="w-full bg-[#0A0A0A] border border-slate-800 rounded-xl p-3 text-sm text-white font-mono focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-400 mb-2 uppercase">
                        Industry
                      </label>
                      <input
                        type="text"
                        value={businessProfileData.industry}
                        onChange={(e) =>
                          setBusinessProfileData({
                            ...businessProfileData,
                            industry: e.target.value,
                          })
                        }
                        className="w-full bg-[#0A0A0A] border border-slate-800 rounded-xl p-3 text-sm text-white font-mono focus:outline-none focus:border-indigo-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-400 mb-2 uppercase">
                        Company Bio
                      </label>
                      <textarea
                        rows={3}
                        value={businessProfileData.companyBio}
                        onChange={(e) =>
                          setBusinessProfileData({
                            ...businessProfileData,
                            companyBio: e.target.value,
                          })
                        }
                        className="w-full bg-[#0A0A0A] border border-slate-800 rounded-xl p-3.5 text-sm text-white focus:outline-none focus:border-indigo-500 resize-none leading-relaxed"
                      />
                    </div>

                    {renderProfileFormActions({ showShareLink: true })}
                  </div>
                )}

                {profileSubMenu === "activeListings" && (
                  <div className="space-y-4 animate-in fade-in">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-bold text-white">
                        Active Job Listings
                      </h3>
                      <button
                        type="button"
                        onClick={openPostJobModal}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold px-3.5 py-2 rounded-lg transition-all cursor-pointer"
                      >
                        + Post New Job
                      </button>
                    </div>

                    {businessListings.length === 0 ? (
                      <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-6 text-center">
                        <p className="text-sm text-slate-400">
                          No active listings yet. Post a job to start receiving
                          candidate interest.
                        </p>
                      </div>
                    ) : (
                      businessListings.map((listing) => (
                      <div
                        key={listing.id}
                        className="flex items-center justify-between p-4 bg-slate-900/50 border border-slate-800 rounded-xl"
                      >
                        <div>
                          <span className="font-bold text-sm text-white block">
                            {listing.title}
                          </span>
                          <button
                            type="button"
                            onClick={() => openApplicantsDrawer(listing)}
                            disabled={listing.applicants <= 0}
                            className={`text-[11px] mt-1 font-bold transition-colors ${
                              listing.applicants > 0
                                ? "text-indigo-400 hover:text-indigo-300 cursor-pointer"
                                : "text-slate-600 cursor-not-allowed"
                            }`}
                          >
                            Interested ({listing.applicants})
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => toggleListingStatus(listing.id)}
                          title="Click to toggle status"
                          className={`px-2.5 py-1 text-[10px] font-bold rounded-full border transition-all cursor-pointer ${
                            listing.status === "Active"
                              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                              : "bg-slate-800 text-slate-400 border-slate-700"
                          }`}
                        >
                          {listing.status}
                        </button>
                      </div>
                    ))
                    )}
                  </div>
                )}

                {profileSubMenu === "overview" && (
                  <div className="space-y-6 animate-in fade-in">
                    <div className="flex items-center gap-5 pb-6 border-b border-slate-800">
                      {loadingProfile ? (
                        <>
                          <div className="w-16 h-16 rounded-2xl bg-slate-800 animate-pulse" />
                          <div className="flex-1 space-y-2">
                            <div className="h-7 w-48 rounded bg-slate-800 animate-pulse" />
                            <div className="h-4 w-32 rounded bg-slate-800 animate-pulse" />
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="w-16 h-16 rounded-2xl bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-xl font-bold text-indigo-400">
                            {profileData?.name?.charAt(0) || "?"}
                          </div>
                          <div className="flex-1">
                            <input
                              type="text"
                              value={profileData.name}
                              onChange={(e) =>
                                setProfileData({
                                  ...profileData,
                                  name: e.target.value,
                                })
                              }
                              className="w-full bg-transparent font-bold text-2xl text-white focus:outline-none border-b border-transparent focus:border-indigo-500 pb-1"
                            />
                            <input
                              type="text"
                              value={title}
                              onChange={(e) => setTitle(e.target.value)}
                              className="w-full bg-transparent text-xs text-indigo-400 font-medium focus:outline-none border-b border-transparent focus:border-indigo-500 pb-1 mt-1"
                              placeholder="Your title or role"
                            />
                          </div>
                        </>
                      )}
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-400 mb-2 uppercase">
                        Experience Level
                      </label>
                      <select
                        value={experienceLevel}
                        onChange={(e) =>
                          setExperienceLevel(e.target.value as ExperienceLevel)
                        }
                        className="w-full bg-[#0A0A0A] border border-slate-800 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-indigo-500"
                      >
                        {EXPERIENCE_LEVEL_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-400 mb-2 uppercase">
                        Bio / Headline
                      </label>
                      <textarea
                        rows={3}
                        value={bio}
                        onChange={(e) => setBio(e.target.value)}
                        className="w-full bg-[#0A0A0A] border border-slate-800 rounded-xl p-3.5 text-sm text-white focus:outline-none focus:border-indigo-500 resize-none leading-relaxed"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-400 mb-2 uppercase">
                        Skills
                      </label>
                      <input
                        type="text"
                        value={skills}
                        onChange={(e) => setSkills(e.target.value)}
                        placeholder="React, TypeScript, Python..."
                        className="w-full bg-[#0A0A0A] border border-slate-800 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-indigo-500"
                      />
                      <p className="text-[11px] text-slate-500 mt-2">
                        Comma-separated skills used for job matching.
                      </p>
                    </div>

                    {renderProfileFormActions()}
                  </div>
                )}

                {profileSubMenu === "academics" && (
                  <div className="space-y-6 animate-in fade-in">
                    <h3 className="text-sm font-bold text-white mb-2">
                      Education & University Status
                    </h3>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-400 mb-2 uppercase">
                          School / Institution
                        </label>
                        <input
                          type="text"
                          value={school}
                          onChange={(e) => setSchool(e.target.value)}
                          className="w-full bg-[#0A0A0A] border border-slate-800 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-400 mb-2 uppercase">
                          {majorLabel}
                        </label>
                        {loadingProfile ? (
                          <div className="h-11 w-full rounded-xl bg-slate-800 animate-pulse" />
                        ) : (
                          <input
                            type="text"
                            value={degree}
                            onChange={(e) => setDegree(e.target.value)}
                            className="w-full bg-[#0A0A0A] border border-slate-800 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-indigo-500"
                          />
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-400 mb-2 uppercase">
                          GPA
                        </label>
                        <input
                          type="text"
                          value={profileData.gpa}
                          onChange={(e) =>
                            setProfileData({
                              ...profileData,
                              gpa: e.target.value,
                            })
                          }
                          className="w-full bg-[#0A0A0A] border border-slate-800 rounded-xl p-3 text-sm text-white font-mono focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-400 mb-2 uppercase">
                          Graduation Year
                        </label>
                        {loadingProfile ? (
                          <div className="h-11 w-full rounded-xl bg-slate-800 animate-pulse" />
                        ) : (
                          <input
                            type="text"
                            value={profileData.gradYear}
                            onChange={(e) =>
                              setProfileData({
                                ...profileData,
                                gradYear: e.target.value,
                              })
                            }
                            className="w-full bg-[#0A0A0A] border border-slate-800 rounded-xl p-3 text-sm text-white font-mono focus:outline-none focus:border-indigo-500"
                          />
                        )}
                      </div>
                    </div>

                    {renderProfileFormActions()}
                  </div>
                )}

                {profileSubMenu === "portfolio" && (
                  <div className="space-y-6 animate-in fade-in">
                    <h3 className="text-sm font-bold text-white mb-2">
                      Verifiable Projects & Links
                    </h3>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-400 mb-2 uppercase">
                          GitHub / Portfolio URL
                        </label>
                        <input
                          type="text"
                          value={portfolioUrl}
                          onChange={(e) => setPortfolioUrl(e.target.value)}
                          className="w-full bg-[#0A0A0A] border border-slate-800 rounded-xl p-3 text-sm text-white font-mono focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-400 mb-2 uppercase">
                          Video Intro / Demo Link
                        </label>
                        {loadingProfile ? (
                          <div className="h-11 w-full rounded-xl bg-slate-800 animate-pulse" />
                        ) : (
                          <>
                            <input
                              type="text"
                              value={profileData.demoVideo}
                              onChange={handleDemoVideoChange}
                              onPaste={handleDemoVideoPaste}
                              aria-invalid={Boolean(demoVideoValidationMessage)}
                              placeholder="https://www.youtube.com/watch?v=..."
                              className={`w-full bg-[#0A0A0A] border rounded-xl p-3 text-sm text-white font-mono focus:outline-none ${
                                demoVideoValidationMessage
                                  ? "border-rose-500/70 focus:border-rose-500"
                                  : "border-slate-800 focus:border-indigo-500"
                              }`}
                            />
                            {demoVideoValidationMessage && (
                              <p className="mt-2 text-[11px] text-rose-400">
                                {demoVideoValidationMessage}
                              </p>
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-400 mb-2 uppercase">
                        Key Accomplishments
                      </label>
                      <textarea
                        rows={4}
                        value={profileData.projects}
                        onChange={(e) =>
                          setProfileData({
                            ...profileData,
                            projects: e.target.value,
                          })
                        }
                        className="w-full bg-[#0A0A0A] border border-slate-800 rounded-xl p-3.5 text-sm text-white focus:outline-none focus:border-indigo-500 resize-none leading-relaxed"
                      />
                    </div>

                    {renderProfileFormActions()}
                  </div>
                )}

                {profileSubMenu === "settings" && (
                  <div className="space-y-6 animate-in fade-in">
                    <h3 className="text-sm font-bold text-white mb-4">
                      {isBusinessAccount
                        ? "Account Settings"
                        : "Account & Visibility Settings"}
                    </h3>

                    {!isBusinessAccount && (
                    <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="p-4 bg-slate-900/50 border border-slate-800 rounded-xl space-y-3">
                        <div>
                          <span className="font-bold text-xs text-white block">
                            Work Preference
                          </span>
                          <span className="text-[11px] text-slate-500">
                            Shown on your public builder card and talent pool
                            profile.
                          </span>
                        </div>
                        <select
                          value={workPreference}
                          onChange={(e) =>
                            setWorkPreference(e.target.value as WorkPreference)
                          }
                          className="w-full bg-[#0A0A0A] border border-slate-800 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-indigo-500"
                        >
                          {WORK_PREFERENCE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="p-4 bg-slate-900/50 border border-slate-800 rounded-xl space-y-3">
                        <div>
                          <span className="font-bold text-xs text-white block">
                            Timezone
                          </span>
                          <span className="text-[11px] text-slate-500">
                            Helps employers understand your working hours.
                          </span>
                        </div>
                        <select
                          value={candidateTimezone}
                          onChange={(e) =>
                            setCandidateTimezone(
                              e.target.value as CandidateTimezone
                            )
                          }
                          className="w-full bg-[#0A0A0A] border border-slate-800 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-indigo-500"
                        >
                          {TIMEZONE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="p-4 bg-slate-900/50 border border-slate-800 rounded-xl space-y-3">
                      <div>
                        <span className="font-bold text-xs text-white block">
                          Availability Status
                        </span>
                        <span className="text-[11px] text-slate-500">
                          Shown on your talent pool card and used by recruiter
                          availability filters.
                        </span>
                      </div>
                      <select
                        value={availabilityStatus}
                        onChange={(e) =>
                          setAvailabilityStatus(
                            e.target.value as AvailabilityStatus
                          )
                        }
                        className="w-full bg-[#0A0A0A] border border-slate-800 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-indigo-500"
                      >
                        {AVAILABILITY_STATUS_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-center justify-between gap-4 p-4 bg-slate-900/50 border border-slate-800 rounded-xl">
                      <div>
                        <span className="font-bold text-xs text-white block">
                          Visible to Employers
                        </span>
                        <span className="text-[11px] text-slate-500">
                          Turn this off if you are hired or no longer want to be contacted by recruiters.
                        </span>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={isVisibleInPool}
                        aria-label="Visible to Employers"
                        onClick={handleVisibilityToggle}
                        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors cursor-pointer ${
                          isVisibleInPool ? "bg-emerald-500" : "bg-zinc-700"
                        }`}
                      >
                        <span
                          aria-hidden
                          className="pointer-events-none absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200"
                          style={{
                            transform: isVisibleInPool
                              ? "translateX(1.25rem)"
                              : "translateX(0)",
                          }}
                        />
                      </button>
                    </div>
                    </>
                    )}

                    {renderProfileFormActions()}

                    {/* Account Settings */}
                    <div className="pt-4">
                      <h3 className="text-sm font-bold text-white pb-3 border-b border-zinc-800">
                        Account Settings
                      </h3>
                      <div className="pt-4 flex items-center justify-between">
                        <div>
                          <span className="font-bold text-xs text-white block">
                            Sign out of Provix
                          </span>
                          <span className="text-[11px] text-slate-500">
                            You&apos;ll be returned to the login screen on this device.
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={handleSignOut}
                          className="bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20 text-xs font-bold px-4 py-2.5 rounded-xl transition-all flex items-center gap-2 cursor-pointer"
                        >
                          <Icons.Logout /> Sign Out
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* CANDIDATE / EMPLOYEE: OPPORTUNITIES JOB FEED */}
          {!isBusinessAccount && activeTab === "opportunities" && (
            <div>
              <div className="mb-8">
                <p className="text-xs font-bold uppercase tracking-widest text-indigo-400 mb-2">
                  Job Feed
                </p>
                <h1 className="text-3xl font-extrabold tracking-tight text-white">
                  Opportunities
                </h1>
                <p className="text-slate-400 text-sm mt-2">
                  Curated openings matched to your profile — express interest in one click.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                <div className="bg-[#111111] p-5 rounded-2xl border border-slate-800/60 shadow-lg">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest block mb-1">
                    Active Openings
                  </span>
                  <span className="text-3xl font-extrabold text-white">
                    {jobsLoading ? "—" : activeOpeningsCount}
                  </span>
                </div>
                <div className="bg-[#111111] p-5 rounded-2xl border border-slate-800/60 shadow-lg">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest block mb-1">
                    Matching Your Skills
                  </span>
                  <span className="text-3xl font-extrabold text-indigo-400">
                    {jobsLoading ? "—" : skillMatchingJobsCount}
                  </span>
                </div>
                <div className="bg-[#111111] p-5 rounded-2xl border border-slate-800/60 shadow-lg">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest block mb-1">
                    Profile Visibility
                  </span>
                  <span
                    className={`text-sm font-extrabold ${
                      profileVisibleToEmployers
                        ? "text-emerald-400"
                        : "text-slate-400"
                    }`}
                  >
                    {loadingProfile
                      ? "—"
                      : profileVisibleToEmployers
                        ? "Active 🟢"
                        : "Hidden"}
                  </span>
                </div>
              </div>

              <div className="bg-[#111111] border border-slate-800/60 rounded-2xl p-4 mb-6 shadow-lg">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="relative flex-1">
                    <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500">
                      <Icons.Search />
                    </span>
                    <input
                      type="text"
                      value={opportunitiesSearch}
                      onChange={(e) => setOpportunitiesSearch(e.target.value)}
                      placeholder="Search roles, companies, or skills..."
                      className="w-full bg-[#0A0A0A] border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-all"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpportunitiesRemoteOnly((prev) => !prev)}
                    className={`shrink-0 text-[11px] font-bold px-4 py-2.5 rounded-xl border transition-all cursor-pointer ${
                      opportunitiesRemoteOnly
                        ? "bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-500/20"
                        : "bg-[#0A0A0A] border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700"
                    }`}
                  >
                    Remote Only
                  </button>
                </div>
              </div>

              {jobsLoading ? (
                <div className="bg-[#111111] border border-slate-800/60 rounded-2xl p-10 text-center">
                  <p className="text-sm font-medium text-slate-400">
                    Loading opportunities...
                  </p>
                </div>
              ) : filteredJobFeed.length === 0 ? (
                <div className="bg-[#111111] border border-slate-800/60 rounded-2xl p-10 text-center">
                  <p className="text-sm font-medium text-slate-300">
                    No jobs match your filters
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Try clearing search or disabling Remote Only.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {filteredJobFeed.map((job) => {
                    const alreadyApplied = appliedJobIds.includes(job.id);
                    const tags = Array.isArray(job.tags) ? job.tags : [];
                    const insight = matchInsights[job.id];
                    const isMatching = matchLoadingIds[job.id];
                    const matchPercent = insight?.match_percentage ?? 0;
                    const formattedSalary = formatSalaryRange(job.salary_range);

                    return (
                      <div
                        key={job.id}
                        className="bg-[#111111] border border-slate-800/60 rounded-2xl p-5 shadow-lg hover:border-slate-700 transition-all flex flex-col"
                      >
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div className="min-w-0">
                            <h3 className="font-bold text-white text-base truncate">
                              {job.title}
                            </h3>
                            <p className="text-sm text-indigo-400 font-medium mt-0.5 truncate">
                              {job.company}
                            </p>
                          </div>
                          <span
                            className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-extrabold border ${
                              isMatching
                                ? "bg-indigo-500/10 text-indigo-300 border-indigo-500/30 animate-pulse"
                                : insight
                                  ? getMatchBadgeClass(matchPercent)
                                  : "bg-slate-800/80 text-slate-500 border-slate-700/50"
                            }`}
                          >
                            {isMatching
                              ? "Scoring…"
                              : insight
                                ? `${matchPercent}% Match`
                                : "Pending"}
                          </span>
                        </div>

                        {formattedSalary ? (
                          <p className="text-sm font-semibold text-emerald-400 mb-1">
                            {formattedSalary}
                          </p>
                        ) : null}
                        <p className="text-xs text-slate-500 mb-4">{job.location}</p>

                        <div className="flex flex-wrap gap-1.5 mb-4">
                          {tags.map((tag: string) => (
                            <span
                              key={tag}
                              className="px-2 py-1 rounded-md text-[10px] font-bold bg-indigo-500/10 text-indigo-300 border border-indigo-500/20"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>

                        {(isMatching || insight) && (
                          <div className="mb-4 rounded-xl bg-[#0A0A0A] border border-slate-800/60 p-3">
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5">
                              AI Breakdown / Insight
                            </span>
                            {isMatching ? (
                              <div className="flex items-center gap-2">
                                <span className="relative flex h-2 w-2">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-60" />
                                  <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500" />
                                </span>
                                <p className="text-xs text-slate-500">
                                  Analyzing your fit with Gemini…
                                </p>
                              </div>
                            ) : (
                              <p className="text-xs text-slate-300 leading-relaxed animate-in fade-in duration-300">
                                {insight?.reasoning}
                              </p>
                            )}
                          </div>
                        )}

                        <div className="mt-auto flex items-center justify-end pt-4 border-t border-slate-800/60">
                          <button
                            type="button"
                            onClick={() => handleExpressInterestToJob(job)}
                            disabled={alreadyApplied}
                            className={`text-[11px] font-bold px-4 py-2 rounded-lg transition-all flex items-center gap-1.5 ${
                              alreadyApplied
                                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 cursor-not-allowed"
                                : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20 cursor-pointer"
                            }`}
                          >
                            {alreadyApplied ? (
                              <>
                                Interest Submitted
                                <Check className="w-3.5 h-3.5" aria-hidden="true" />
                              </>
                            ) : (
                              "Express Interest"
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ADMISSIONS: ESSAY STUDIO */}
          {activeTab === "essay-studio" && (
            <div>
              <div className="mb-8">
                <p className="text-xs font-bold uppercase tracking-widest text-indigo-400 mb-2">
                  College Prep
                </p>
                <h1 className="text-3xl font-extrabold tracking-tight text-white">
                  Essay Studio
                </h1>
                <p className="text-slate-400 text-sm mt-2">
                  AI-driven structural analysis and line-by-line feedback for your Common App essays.
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
                {/* Left: inputs */}
                <div className="lg:col-span-7 bg-[#111111] rounded-2xl border border-slate-800/60 p-5 sm:p-6 shadow-lg space-y-4">
                  <div>
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest block mb-2">
                      Target School
                    </label>
                    <input
                      type="text"
                      value={essayTargetSchool}
                      onChange={(e) => setEssayTargetSchool(e.target.value)}
                      placeholder="e.g. Stanford University"
                      className="w-full bg-[#0A0A0A] border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-all"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest block mb-2">
                      College Prompt
                    </label>
                    <textarea
                      rows={3}
                      value={essayPrompt}
                      onChange={(e) => setEssayPrompt(e.target.value)}
                      placeholder="Paste the essay prompt you're responding to..."
                      className="w-full bg-[#0A0A0A] border border-slate-800 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 resize-none transition-all"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">
                        Essay Draft
                      </label>
                      <span className="text-[11px] font-mono text-slate-500">
                        {essayWordCount} {essayWordCount === 1 ? "word" : "words"}
                      </span>
                    </div>
                    <textarea
                      rows={14}
                      value={essayText}
                      onChange={(e) => setEssayText(e.target.value)}
                      placeholder="Paste your essay draft here..."
                      className="w-full bg-[#0A0A0A] border border-slate-800 rounded-xl px-4 py-4 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 resize-none transition-all"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={runEssayAudit}
                    disabled={
                      evaluatingEssay || !essayPrompt.trim() || !essayText.trim()
                    }
                    className={`w-full font-bold py-3.5 rounded-xl text-xs transition-all flex items-center justify-center gap-2 ${
                      evaluatingEssay
                        ? "bg-indigo-600/80 text-white cursor-wait animate-pulse"
                        : !essayPrompt.trim() || !essayText.trim()
                          ? "bg-slate-800 text-slate-500 cursor-not-allowed"
                          : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20 cursor-pointer"
                    }`}
                  >
                    {evaluatingEssay ? (
                      <>
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-60" />
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
                        </span>
                        Analyzing Essay with AI…
                      </>
                    ) : (
                      "Analyze Essay with AI"
                    )}
                  </button>
                </div>

                {/* Right: results */}
                <div className="lg:col-span-5 bg-[#111111] rounded-2xl border border-slate-800/60 p-5 sm:p-6 shadow-lg">
                  {evaluatingEssay ? (
                    <div className="flex flex-col items-center justify-center min-h-[320px] text-center">
                      <div className="relative mb-4">
                        <div className="w-16 h-16 rounded-full border-2 border-indigo-500/30 flex items-center justify-center animate-pulse">
                          <Icons.Pen />
                        </div>
                        <span className="absolute -top-1 -right-1 flex h-3 w-3">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-3 w-3 bg-indigo-500" />
                        </span>
                      </div>
                      <p className="text-sm font-medium text-slate-300">
                        Gemini is reviewing your essay…
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        Checking structure, voice, and prompt alignment
                      </p>
                    </div>
                  ) : essayReview ? (
                    <div className="space-y-5">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">
                            Overall Score
                          </span>
                          <p className="text-sm text-slate-300 leading-relaxed">
                            {essayReview.verdict}
                          </p>
                        </div>
                        <div
                          className={`shrink-0 w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-extrabold border ${
                            essayReview.overallScore >= 8
                              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/25"
                              : essayReview.overallScore >= 6
                                ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/25"
                                : "bg-amber-500/10 text-amber-400 border-amber-500/25"
                          }`}
                        >
                          {essayReview.overallScore}
                          <span className="text-[10px] font-bold ml-0.5 opacity-70">
                            /10
                          </span>
                        </div>
                      </div>

                      {essayReview.strengths.length > 0 && (
                        <div className="rounded-xl bg-[#0A0A0A] border border-emerald-500/20 p-4">
                          <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest block mb-2">
                            Strengths
                          </span>
                          <ul className="space-y-1.5">
                            {essayReview.strengths.map((item) => (
                              <li
                                key={item}
                                className="text-xs text-slate-300 leading-relaxed flex gap-2"
                              >
                                <span className="text-emerald-400 shrink-0">+</span>
                                <span>{item}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {essayReview.improvements.length > 0 && (
                        <div className="rounded-xl bg-[#0A0A0A] border border-amber-500/20 p-4">
                          <span className="text-[10px] font-bold text-amber-400 uppercase tracking-widest block mb-2">
                            Areas to Improve
                          </span>
                          <ul className="space-y-1.5">
                            {essayReview.improvements.map((item) => (
                              <li
                                key={item}
                                className="text-xs text-slate-300 leading-relaxed flex gap-2"
                              >
                                <span className="text-amber-400 shrink-0">→</span>
                                <span>{item}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {essayReview.lineFeedback.length > 0 && (
                        <div>
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-3">
                            Actionable Suggestions
                          </span>
                          <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                            {essayReview.lineFeedback.map((item, index) => (
                              <div
                                key={`${item.originalText}-${index}`}
                                className="rounded-xl bg-[#0A0A0A] border border-slate-800/60 p-3"
                              >
                                {item.originalText && (
                                  <p className="text-[11px] text-slate-500 italic mb-2 border-l-2 border-slate-700 pl-2">
                                    &ldquo;{item.originalText}&rdquo;
                                  </p>
                                )}
                                <p className="text-xs text-indigo-300 font-medium mb-1">
                                  {item.suggestion}
                                </p>
                                <p className="text-[11px] text-slate-500">
                                  {item.reason}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center min-h-[320px] text-center">
                      <div className="w-12 h-12 rounded-xl bg-slate-800/60 flex items-center justify-center text-slate-500 mb-4">
                        <Icons.Pen />
                      </div>
                      <p className="text-sm font-medium text-slate-400">
                        Awaiting essay input
                      </p>
                      <p className="text-xs text-slate-500 mt-1 max-w-xs">
                        Add your target school, prompt, and draft — then run an AI analysis.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ADMISSIONS: APPEAL STRATEGIST */}
          {activeTab === "aid-appeals" && (
            <div>
              <div className="mb-8">
                <p className="text-xs font-bold uppercase tracking-widest text-indigo-400 mb-2">
                  College Prep
                </p>
                <h1 className="text-3xl font-extrabold tracking-tight text-white">
                  Appeal Strategist
                </h1>
                <p className="text-slate-400 text-sm mt-2">
                  Assess your case strength, build an evidence checklist, and draft a professional aid appeal letter.
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
                {/* Left: inputs */}
                <div className="lg:col-span-5 bg-[#111111] rounded-2xl border border-slate-800/60 p-5 sm:p-6 shadow-lg space-y-4">
                  <div>
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest block mb-2">
                      College Name
                    </label>
                    <input
                      type="text"
                      value={collegeName}
                      onChange={(e) => setCollegeName(e.target.value)}
                      placeholder="e.g. NYU, Stanford University"
                      className="w-full bg-[#0A0A0A] border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-all"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest block mb-2">
                      Current Aid Offer (Optional)
                    </label>
                    <input
                      type="text"
                      value={currentOffer}
                      onChange={(e) => setCurrentOffer(e.target.value)}
                      placeholder="e.g. $12,000 grant + $5,500 loans"
                      className="w-full bg-[#0A0A0A] border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-all"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest block mb-2">
                      Appeal Reason
                    </label>
                    <select
                      value={appealReason}
                      onChange={(e) => setAppealReason(e.target.value)}
                      className="w-full bg-[#0A0A0A] border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-all cursor-pointer"
                    >
                      <option value="Competing Offer">Competing Offer</option>
                      <option value="Financial Hardship">Financial Hardship</option>
                      <option value="Merit-Based Review">Merit-Based Review</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest block mb-2">
                      Detailed Notes
                    </label>
                    <textarea
                      rows={8}
                      value={contextDetails}
                      onChange={(e) => setContextDetails(e.target.value)}
                      placeholder="Describe changed circumstances, competing offers, family income updates, or merit achievements..."
                      className="w-full bg-[#0A0A0A] border border-slate-800 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 resize-none transition-all"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={generateAidAppeal}
                    disabled={
                      generatingAid ||
                      !collegeName.trim() ||
                      !contextDetails.trim()
                    }
                    className={`w-full font-bold py-3.5 rounded-xl text-xs transition-all flex items-center justify-center gap-2 ${
                      generatingAid
                        ? "bg-indigo-600/80 text-white cursor-wait animate-pulse"
                        : !collegeName.trim() || !contextDetails.trim()
                          ? "bg-slate-800 text-slate-500 cursor-not-allowed"
                          : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20 cursor-pointer"
                    }`}
                  >
                    {generatingAid ? (
                      <>
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-60" />
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
                        </span>
                        Building appeal strategy & draft…
                      </>
                    ) : (
                      "Generate Appeal Strategy & Draft"
                    )}
                  </button>
                </div>

                {/* Right: results */}
                <div className="lg:col-span-7 space-y-4">
                  {generatingAid ? (
                    <div className="bg-[#111111] rounded-2xl border border-slate-800/60 p-10 shadow-lg flex flex-col items-center justify-center min-h-[420px] text-center">
                      <div className="relative mb-4">
                        <div className="w-16 h-16 rounded-full border-2 border-indigo-500/30 flex items-center justify-center animate-pulse">
                          <FileText className="w-7 h-7 text-indigo-400" aria-hidden="true" />
                        </div>
                        <span className="absolute -top-1 -right-1 flex h-3 w-3">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-60" />
                          <span className="relative inline-flex rounded-full h-3 w-3 bg-indigo-500" />
                        </span>
                      </div>
                      <p className="text-sm font-medium text-slate-300">
                        Analyzing case strength & drafting letter…
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        Gemini is building your strategy, document checklist, and appeal draft
                      </p>
                    </div>
                  ) : aidAppealResult ? (
                    <>
                      <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-2xl p-4 sm:p-5">
                        <p className="text-xs text-indigo-200/90 leading-relaxed">
                          Financial aid offices approve appeals based on verifiable documentation. Use this tailored draft as your structural foundation and attach the recommended evidence.
                        </p>
                      </div>

                      <div className="bg-[#111111] rounded-2xl border border-slate-800/60 p-5 sm:p-6 shadow-lg">
                        <div className="flex items-center justify-between gap-3 mb-4">
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                            Strategy & Case Strength
                          </span>
                          <span
                            className={`px-3 py-1 rounded-full text-[10px] font-extrabold border ${getStrategyBadgeClass(aidAppealResult.strategyScore)}`}
                          >
                            {aidAppealResult.strategyScore}
                          </span>
                        </div>
                        <p className="text-xs text-slate-300 leading-relaxed">
                          {aidAppealResult.strategyAnalysis}
                        </p>
                        {aidAppealResult.negotiationDosAndDonts.length > 0 && (
                          <div className="mt-5 pt-5 border-t border-slate-800/60">
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-3">
                              Negotiation Do&apos;s & Don&apos;ts
                            </span>
                            <ul className="space-y-2">
                              {aidAppealResult.negotiationDosAndDonts.map((item) => (
                                <li
                                  key={item}
                                  className="text-xs text-slate-400 leading-relaxed flex gap-2"
                                >
                                  <span className="text-emerald-400 shrink-0">→</span>
                                  <span>{item}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>

                      <div className="bg-[#111111] rounded-2xl border border-slate-800/60 p-5 sm:p-6 shadow-lg">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-3">
                          Required Documents & Evidence Checklist
                        </span>
                        <ul className="space-y-2">
                          {aidAppealResult.requiredDocuments.map((document) => (
                            <li key={document}>
                              <label className="flex items-start gap-3 cursor-pointer group">
                                <input
                                  type="checkbox"
                                  checked={!!checkedDocuments[document]}
                                  onChange={() => toggleDocumentChecked(document)}
                                  className="mt-0.5 h-4 w-4 rounded border-slate-700 bg-[#0A0A0A] text-indigo-500 focus:ring-indigo-500/30 focus:ring-offset-0 cursor-pointer"
                                />
                                <span
                                  className={`text-xs leading-relaxed transition-colors ${
                                    checkedDocuments[document]
                                      ? "text-slate-500 line-through"
                                      : "text-slate-300 group-hover:text-slate-200"
                                  }`}
                                >
                                  {document}
                                </span>
                              </label>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="bg-[#111111] rounded-2xl border border-slate-800/60 p-5 sm:p-6 shadow-lg">
                        <div className="flex items-center justify-between gap-3 mb-4">
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                            Formal Letter Drafter
                          </span>
                          <button
                            type="button"
                            onClick={copyAppealLetter}
                            className={`text-[11px] font-bold px-3 py-1.5 rounded-lg border transition-all flex items-center gap-1.5 cursor-pointer ${
                              letterCopied
                                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                : "bg-[#0A0A0A] text-slate-400 border-slate-800 hover:text-slate-200 hover:border-slate-700"
                            }`}
                          >
                            {letterCopied ? (
                              <>
                                <Check className="w-3.5 h-3.5" aria-hidden="true" />
                                Copied!
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                                Copy Draft
                              </>
                            )}
                          </button>
                        </div>

                        <p className="text-xs font-semibold text-indigo-400 mb-3">
                          Subject: {aidAppealResult.letterSubject}
                        </p>
                        <div className="rounded-xl bg-[#0A0A0A] border border-slate-800/60 p-4 text-[13px] text-slate-300 leading-relaxed whitespace-pre-wrap">
                          {aidAppealResult.letterBody}
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="bg-[#111111] rounded-2xl border border-slate-800/60 p-10 shadow-lg flex flex-col items-center justify-center min-h-[420px] text-center">
                      <div className="w-12 h-12 rounded-xl bg-slate-800/60 flex items-center justify-center text-slate-500 mb-4">
                        <FileText className="w-6 h-6" aria-hidden="true" />
                      </div>
                      <p className="text-sm font-medium text-slate-400">
                        Your appeal strategy will appear here
                      </p>
                      <p className="text-xs text-slate-500 mt-1 max-w-sm">
                        Enter your college details and case context, then generate a tailored strategy, evidence checklist, and letter draft.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ADMISSIONS: COLLEGE FIT AI */}
          {activeTab === "college-fit" && (
            <div>
              <div className="mb-8">
                <p className="text-xs font-bold uppercase tracking-widest text-indigo-400 mb-2">
                  College Prep
                </p>
                <h1 className="text-3xl font-extrabold tracking-tight text-white">
                  College Fit AI
                </h1>
                <p className="text-slate-400 text-sm mt-2">
                  Personalized reach, target, and safety school recommendations based on your profile.
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
                <div className="lg:col-span-4 bg-[#111111] rounded-2xl border border-slate-800/60 p-5 sm:p-6 shadow-lg space-y-4">
                  <div>
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest block mb-2">
                      GPA
                    </label>
                    <input
                      type="text"
                      value={fitGpa}
                      onChange={(e) => setFitGpa(e.target.value)}
                      placeholder="e.g. 3.8"
                      className="w-full bg-[#0A0A0A] border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-all"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest block mb-2">
                      Intended Major
                    </label>
                    <input
                      type="text"
                      value={fitMajor}
                      onChange={(e) => setFitMajor(e.target.value)}
                      placeholder="e.g. Computer Science"
                      className="w-full bg-[#0A0A0A] border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-all"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest block mb-2">
                      Test Scores
                    </label>
                    <input
                      type="text"
                      value={fitTestScores}
                      onChange={(e) => setFitTestScores(e.target.value)}
                      placeholder="e.g. SAT 1450 / ACT 32"
                      className="w-full bg-[#0A0A0A] border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-all"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest block mb-2">
                      Location Preference
                    </label>
                    <input
                      type="text"
                      value={fitLocationPreference}
                      onChange={(e) => setFitLocationPreference(e.target.value)}
                      placeholder="e.g. West Coast, Northeast"
                      className="w-full bg-[#0A0A0A] border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-all"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest block mb-2">
                      Annual Budget Preference
                    </label>
                    <input
                      type="text"
                      value={fitBudgetPreference}
                      onChange={(e) => setFitBudgetPreference(e.target.value)}
                      placeholder="e.g. Under $30k net cost"
                      className="w-full bg-[#0A0A0A] border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-all"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={generateCollegeFitReport}
                    disabled={
                      generatingCollegeFit || !fitGpa.trim() || !fitMajor.trim()
                    }
                    className={`w-full font-bold py-3.5 rounded-xl text-xs transition-all flex items-center justify-center gap-2 ${
                      generatingCollegeFit
                        ? "bg-indigo-600/80 text-white cursor-wait animate-pulse"
                        : !fitGpa.trim() || !fitMajor.trim()
                          ? "bg-slate-800 text-slate-500 cursor-not-allowed"
                          : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20 cursor-pointer"
                    }`}
                  >
                    {generatingCollegeFit ? (
                      <>
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-60" />
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
                        </span>
                        Generating Fit Report…
                      </>
                    ) : (
                      "Generate Fit Report with AI"
                    )}
                  </button>
                </div>

                <div className="lg:col-span-8 space-y-6">
                  {collegeFitError && !generatingCollegeFit && (
                    <div className="rounded-xl border border-red-500/25 bg-red-500/5 p-4 space-y-3">
                      <p className="text-xs text-red-200 leading-relaxed">
                        {collegeFitError}
                      </p>
                      <button
                        type="button"
                        onClick={generateCollegeFitReport}
                        className="w-full bg-red-500/10 hover:bg-red-500/15 border border-red-500/25 text-red-200 font-semibold py-2 rounded-lg text-xs transition-all cursor-pointer"
                      >
                        Retry Fit Report
                      </button>
                    </div>
                  )}

                  {generatingCollegeFit ? (
                    <div className="bg-[#111111] rounded-2xl border border-slate-800/60 p-6 sm:p-8 shadow-lg space-y-5 min-h-[320px]">
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <div className="w-12 h-12 rounded-full border-2 border-indigo-500/30 flex items-center justify-center animate-pulse">
                            <Icons.GraduationCap />
                          </div>
                          <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-indigo-500" />
                          </span>
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-white">
                            College Fit Radar
                          </p>
                          <p className="text-xs text-slate-500">
                            Provix AI is building your personalized strategy...
                          </p>
                        </div>
                      </div>

                      <div className="space-y-2.5">
                        {COLLEGE_FIT_STAGES.map((stageLabel, index) => {
                          const isComplete = index < collegeFitStage;
                          const isActive = index === collegeFitStage;

                          return (
                            <div
                              key={stageLabel}
                              className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 transition-all duration-300 ${
                                isComplete
                                  ? "border-emerald-500/25 bg-emerald-500/5"
                                  : isActive
                                    ? "border-indigo-500/30 bg-indigo-500/10"
                                    : "border-slate-800 bg-[#0A0A0A]"
                              }`}
                            >
                              <span
                                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold ${
                                  isComplete
                                    ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-400"
                                    : isActive
                                      ? "border-indigo-500/40 bg-indigo-500/15 text-indigo-300"
                                      : "border-slate-700 text-slate-600"
                                }`}
                              >
                                {isComplete ? (
                                  <Check className="h-3 w-3" aria-hidden />
                                ) : isActive ? (
                                  <span className="h-2 w-2 rounded-full bg-indigo-400 animate-pulse" />
                                ) : (
                                  index + 1
                                )}
                              </span>
                              <p
                                className={`text-xs leading-relaxed ${
                                  isComplete
                                    ? "text-emerald-200"
                                    : isActive
                                      ? "text-indigo-100"
                                      : "text-slate-500"
                                }`}
                              >
                                {stageLabel}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : collegeFitReport ? (
                    <>
                      <div className="bg-[#111111] rounded-2xl border border-slate-800/60 p-5 sm:p-6 shadow-lg">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-2">
                          Fit Summary
                        </span>
                        <p className="text-sm text-slate-300 leading-relaxed">
                          {collegeFitReport.summary}
                        </p>
                      </div>

                      {[
                        {
                          title: "Reach",
                          Icon: Flame,
                          iconClassName: "w-4 h-4 text-red-400",
                          schools: collegeFitReport.reachSchools,
                          accent: "border-rose-500/20",
                          badge: "bg-rose-500/10 text-rose-400 border-rose-500/20",
                        },
                        {
                          title: "Target",
                          Icon: Target,
                          iconClassName: "w-4 h-4 text-blue-400",
                          schools: collegeFitReport.targetSchools,
                          accent: "border-indigo-500/20",
                          badge: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
                        },
                        {
                          title: "Safety",
                          Icon: ShieldCheck,
                          iconClassName: "w-4 h-4 text-emerald-400",
                          schools: collegeFitReport.safetySchools,
                          accent: "border-emerald-500/20",
                          badge: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
                        },
                      ].map((section) => (
                        <div
                          key={section.title}
                          className={`bg-[#111111] rounded-2xl border ${section.accent} p-5 sm:p-6 shadow-lg`}
                        >
                          <h3 className="text-sm font-extrabold text-white mb-4 flex items-center gap-2">
                            <section.Icon
                              className={section.iconClassName}
                              aria-hidden="true"
                            />
                            <span>{section.title}</span>
                          </h3>
                          {section.schools.length === 0 ? (
                            <p className="text-xs text-slate-500">
                              No {section.title.toLowerCase()} schools returned.
                            </p>
                          ) : (
                            <div className="grid grid-cols-1 gap-4">
                              {section.schools.map((school) => (
                                <div
                                  key={`${section.title}-${school.name}`}
                                  className="rounded-xl bg-[#0A0A0A] border border-slate-800/60 p-4 sm:p-5"
                                >
                                  <div className="flex items-start justify-between gap-3 mb-3">
                                    <div className="min-w-0">
                                      <h4 className="font-bold text-white text-sm">
                                        {school.name}
                                      </h4>
                                      <p className="text-[11px] text-slate-500 mt-0.5">
                                        {school.location}
                                      </p>
                                    </div>
                                    <span
                                      className={`shrink-0 px-2 py-1 rounded-full text-[10px] font-bold border ${section.badge}`}
                                    >
                                      {school.fitBadge}
                                    </span>
                                  </div>

                                  <p className="text-xs text-slate-300 leading-relaxed mb-4">
                                    {school.matchReason}
                                  </p>

                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-3 border-t border-slate-800/80">
                                    <div className="rounded-lg border border-slate-800/60 bg-[#111111] p-3">
                                      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block mb-1.5">
                                        Acceptance Odds
                                      </span>
                                      <p className="text-xs text-slate-300 leading-relaxed">
                                        {school.acceptanceOdds}
                                      </p>
                                    </div>
                                    <div className="rounded-lg border border-slate-800/60 bg-[#111111] p-3">
                                      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block mb-1.5">
                                        Financial Profile
                                      </span>
                                      <p className="text-xs text-slate-300 leading-relaxed">
                                        {school.financialProfile}
                                      </p>
                                    </div>
                                    <div className="md:col-span-2 rounded-lg border border-slate-800/60 bg-[#111111] p-3">
                                      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block mb-1.5">
                                        Departmental Strengths
                                      </span>
                                      <p className="text-xs text-slate-300 leading-relaxed">
                                        {school.departmentalStrengths}
                                      </p>
                                    </div>
                                    <div className="md:col-span-2 rounded-lg border border-indigo-500/15 bg-indigo-500/5 p-3">
                                      <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-300 block mb-2">
                                        Essay Angles
                                      </span>
                                      <ul className="space-y-1.5">
                                        {school.essayAngles.map((angle) => (
                                          <li
                                            key={`${school.name}-${angle}`}
                                            className="text-xs text-indigo-100/90 leading-relaxed flex items-start gap-2"
                                          >
                                            <Sparkles
                                              className="w-3 h-3 mt-0.5 shrink-0 text-indigo-400"
                                              aria-hidden
                                            />
                                            <span>{angle}</span>
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                    {school.profileRedFlags.length > 0 && (
                                      <div className="md:col-span-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                                        <span className="text-[10px] font-bold uppercase tracking-widest text-amber-300 block mb-2">
                                          Profile Red Flags
                                        </span>
                                        <ul className="space-y-1.5">
                                          {school.profileRedFlags.map((flag) => (
                                            <li
                                              key={`${school.name}-${flag}`}
                                              className="text-xs text-amber-100/90 leading-relaxed flex items-start gap-2"
                                            >
                                              <AlertTriangle
                                                className="w-3 h-3 mt-0.5 shrink-0 text-amber-400"
                                                aria-hidden
                                              />
                                              <span>{flag}</span>
                                            </li>
                                          ))}
                                        </ul>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </>
                  ) : (
                    <div className="bg-[#111111] rounded-2xl border border-slate-800/60 p-10 shadow-lg flex flex-col items-center justify-center min-h-[320px] text-center">
                      <div className="w-12 h-12 rounded-xl bg-slate-800/60 flex items-center justify-center text-slate-500 mb-4">
                        <Icons.GraduationCap />
                      </div>
                      <p className="text-sm font-medium text-slate-400">
                        Awaiting your profile
                      </p>
                      <p className="text-xs text-slate-500 mt-1 max-w-sm">
                        Enter your GPA, major, and preferences — then generate a personalized reach / target / safety list.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* EMPLOYEE: OPPORTUNITY RADAR */}
          {isEmployeeAccount && activeTab === "opportunity_radar" && (
            <div>
              <div className="mb-8">
                <p className="text-xs font-bold uppercase tracking-widest text-indigo-400 mb-2">
                  Live Matching
                </p>
                <h1 className="text-3xl font-extrabold tracking-tight text-white">
                  Opportunity Radar
                </h1>
                <p className="text-slate-400 text-sm mt-2">
                  AI-matched roles from verified employers — tuned to your skills and visibility settings.
                </p>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
                <div className="bg-[#111111] p-5 rounded-2xl border border-slate-800/60 shadow-lg">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest block mb-1">
                    Active Roles
                  </span>
                  <span className="text-3xl font-extrabold text-white">
                    {jobsLoading ? "—" : filteredRadarJobFeed.length}
                  </span>
                  <p className="text-[11px] text-slate-500 mt-1">
                    of {jobsLoading ? "—" : jobs.length} total
                  </p>
                </div>
                <div className="bg-[#111111] p-5 rounded-2xl border border-slate-800/60 shadow-lg">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest block mb-1">
                    Direct Matches
                  </span>
                  <span className="text-3xl font-extrabold text-emerald-400">
                    {jobsLoading ? "—" : radarDirectMatchesCount}
                  </span>
                  <p className="text-[11px] text-slate-500 mt-1">90%+ fit score</p>
                </div>
                <div className="bg-[#111111] p-5 rounded-2xl border border-slate-800/60 shadow-lg col-span-2 lg:col-span-1">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest block mb-1">
                    Profile Views
                  </span>
                  <span className="text-3xl font-extrabold text-indigo-400">
                    {profileViewsCount}
                  </span>
                  <p className="text-[11px] text-slate-500 mt-1">last 30 days</p>
                </div>
              </div>

              <div className="bg-[#111111] border border-slate-800/60 rounded-2xl p-4 mb-6 shadow-lg">
                <div className="flex flex-col lg:flex-row lg:items-center gap-3">
                  <div className="relative flex-1">
                    <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500">
                      <Icons.Search />
                    </span>
                    <input
                      type="text"
                      value={radarSearch}
                      onChange={(e) => setRadarSearch(e.target.value)}
                      placeholder="Search by role title..."
                      className="w-full bg-[#0A0A0A] border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-all"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setRemoteOnly((prev) => !prev)}
                    className={`shrink-0 text-[11px] font-bold px-4 py-2.5 rounded-xl border transition-all cursor-pointer ${
                      remoteOnly
                        ? "bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-500/20"
                        : "bg-[#0A0A0A] border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700"
                    }`}
                  >
                    Remote Only
                  </button>
                  <select
                    value={radarExperienceFilter}
                    onChange={(e) => setRadarExperienceFilter(e.target.value)}
                    className="shrink-0 bg-[#0A0A0A] border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-all cursor-pointer"
                  >
                    <option value="all">All Experience Levels</option>
                    <option value="Entry-Level">Entry-Level</option>
                    <option value="Mid-Level">Mid-Level</option>
                  </select>
                </div>
              </div>

              {jobsLoading ? (
                <div className="bg-[#111111] border border-slate-800/60 rounded-2xl p-10 text-center">
                  <p className="text-sm font-medium text-slate-400">
                    Loading opportunities...
                  </p>
                </div>
              ) : filteredRadarJobFeed.length === 0 ? (
                <div className="bg-[#111111] border border-slate-800/60 rounded-2xl p-10 text-center">
                  <p className="text-sm font-medium text-slate-300">
                    No opportunities match your filters
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Try clearing search or disabling Remote Only.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {filteredRadarJobFeed.map((job) => {
                    const alreadyInterested = appliedJobIds.includes(job.id);
                    const isSaved = savedOpportunityIds.includes(job.id);
                    const tags = Array.isArray(job.tags) ? job.tags : [];
                    const insight = matchInsights[job.id];
                    const isMatching = matchLoadingIds[job.id];
                    const matchPercent = insight?.match_percentage ?? 0;
                    const companyInitials = (job.company ?? "PX")
                      .split(/\s+/)
                      .slice(0, 2)
                      .map((part: string) => part.charAt(0))
                      .join("")
                      .toUpperCase();
                    const formattedSalary = formatSalaryRange(job.salary_range);

                    return (
                      <div
                        key={job.id}
                        className="bg-[#111111] border border-slate-800/60 rounded-2xl p-5 shadow-lg hover:border-slate-700 transition-all flex flex-col"
                      >
                        <div className="flex items-start justify-between gap-3 mb-4">
                          <div className="flex items-start gap-3 min-w-0">
                            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/20 flex items-center justify-center shrink-0">
                              <span className="text-xs font-extrabold text-indigo-300">
                                {companyInitials}
                              </span>
                            </div>
                            <div className="min-w-0">
                              <h3 className="font-bold text-white text-base truncate">
                                {job.title}
                              </h3>
                              <p className="text-sm text-slate-400 font-medium mt-0.5 truncate">
                                {job.company}
                              </p>
                              {formattedSalary && (
                                <span className="inline-flex mt-2 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                  {formattedSalary}
                                </span>
                              )}
                            </div>
                          </div>
                          <span
                            className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-extrabold ${
                              isMatching
                                ? "bg-indigo-500/10 text-indigo-300 border border-indigo-500/30 animate-pulse"
                                : insight
                                  ? getMatchBadgeClass(matchPercent)
                                  : "bg-slate-800/80 text-slate-500 border border-slate-700/50"
                            }`}
                          >
                            {isMatching
                              ? "Scoring…"
                              : insight
                                ? `${matchPercent}% Match`
                                : "Pending"}
                          </span>
                        </div>

                        <p className="text-xs text-slate-500 mb-3">{job.location}</p>

                        <div className="mb-5">
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-2">
                            Tech Stack
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {tags.map((tag: string) => (
                              <span
                                key={tag}
                                className="px-2 py-1 rounded-md text-[10px] font-bold bg-indigo-500/10 text-indigo-300 border border-indigo-500/20"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>

                        {(isMatching || insight) && (
                          <div className="mb-5 rounded-xl bg-[#0A0A0A] border border-slate-800/60 p-3">
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5">
                              AI Breakdown / Insight
                            </span>
                            {isMatching ? (
                              <div className="flex items-center gap-2">
                                <span className="relative flex h-2 w-2">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-60" />
                                  <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500" />
                                </span>
                                <p className="text-xs text-slate-500">
                                  Analyzing your fit with Gemini…
                                </p>
                              </div>
                            ) : (
                              <p className="text-xs text-slate-300 leading-relaxed animate-in fade-in duration-300">
                                {insight?.reasoning}
                              </p>
                            )}
                          </div>
                        )}

                        <div className="mt-auto flex items-center justify-between gap-3 pt-4 border-t border-slate-800/60">
                          <button
                            type="button"
                            onClick={() =>
                              handleSaveOpportunity(job.id, job.title ?? "Role")
                            }
                            className={`text-[11px] font-bold px-3 py-2 rounded-lg border transition-all cursor-pointer flex items-center gap-1.5 ${
                              isSaved
                                ? "bg-indigo-500/10 border-indigo-500/30 text-indigo-400"
                                : "bg-[#0A0A0A] border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700"
                            }`}
                          >
                            <Icons.Bookmark />
                            {isSaved ? "Saved" : "Save"}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleExpressInterest(job)}
                            disabled={alreadyInterested}
                            className={`text-[11px] font-bold px-4 py-2 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                              alreadyInterested
                                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 cursor-not-allowed"
                                : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20"
                            }`}
                          >
                            {alreadyInterested ? (
                              <>
                                Interest Submitted
                                <Check className="w-3.5 h-3.5" aria-hidden="true" />
                              </>
                            ) : (
                              "Express Interest"
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* EMPLOYEE: APPLICATIONS */}
          {isEmployeeAccount && activeTab === "applications" && (
            <div>
              <div className="mb-8">
                <p className="text-xs font-bold uppercase tracking-widest text-indigo-400 mb-2">
                  Job Search
                </p>
                <h1 className="text-3xl font-extrabold tracking-tight text-white">
                  Applications
                </h1>
                <p className="text-slate-400 text-sm mt-2">
                  Track roles you&apos;ve applied to and their current status.
                </p>
              </div>

              {appliedJobs.length === 0 ? (
                <div className="bg-[#111111] border border-slate-800/60 rounded-2xl p-10 text-center">
                  <p className="text-sm font-medium text-slate-300">
                    No applications yet
                  </p>
                  <p className="text-xs text-slate-500 mt-1 mb-5">
                    Scan the radar and express interest in your first match.
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTab("opportunity_radar")}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-4 py-2.5 rounded-lg transition-all cursor-pointer"
                  >
                    Open Opportunity Radar
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {appliedJobs.map((application) => (
                    <div
                      key={application.jobId}
                      className="bg-[#111111] border border-slate-800/60 rounded-2xl p-5 shadow-lg flex flex-col md:flex-row md:items-center md:justify-between gap-4"
                    >
                      <div>
                        <h3 className="font-bold text-white text-base">
                          {application.title}
                        </h3>
                        <p className="text-sm text-indigo-400 font-medium mt-0.5">
                          {application.company}
                        </p>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-slate-400">
                          <span>{application.salary}</span>
                          <span>{application.location}</span>
                          <span>Interest expressed {application.appliedAt}</span>
                        </div>
                      </div>
                      <span
                        className={`self-start md:self-center px-3 py-1.5 rounded-full text-[10px] font-bold shrink-0 ${
                          application.status === "Interest Expressed"
                            ? "bg-purple-500/10 text-purple-400 border border-purple-500/20"
                            : application.status === "Submitted"
                            ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20"
                            : application.status === "Under Review"
                              ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                              : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                        }`}
                      >
                        {application.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* EMPLOYER: VETTED TALENT POOL */}
          {showTalentPoolNav && activeTab === "talent" && (
            <div>
              <div className="flex items-end justify-between mb-8">
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-indigo-400 mb-2">
                    Employer Console
                  </p>
                  <h1 className="text-3xl font-extrabold tracking-tight text-white">
                    {isBusinessAccount
                      ? `Welcome, ${employerCompanyName}`
                      : "Vetted Talent Pool"}
                  </h1>
                  <p className="text-slate-400 text-sm mt-2">
                    {isBusinessAccount
                      ? "Your company profile is live. Search anonymized, AI-vetted talent below."
                      : "Hire top young talent based on verifiable projects and education."}
                  </p>
                </div>
                {isBusinessAccount && (
                  <button
                    type="button"
                    onClick={openPostJobModal}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-lg shadow-indigo-500/20 transition-all cursor-pointer shrink-0"
                  >
                    + Post New Job
                  </button>
                )}
              </div>

              {/* METRICS ROW */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                <div className="bg-[#111111] p-5 rounded-2xl border border-slate-800/60 shadow-lg">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest block mb-1">
                    Total Candidates
                  </span>
                  <span className="text-3xl font-extrabold text-white">
                    {candidates.length}
                  </span>
                </div>
                <div className="bg-[#111111] p-5 rounded-2xl border border-slate-800/60 shadow-lg">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest block mb-1">
                    Saved Profiles
                  </span>
                  <span className="text-3xl font-extrabold text-white">
                    {savedProfilesCount}
                  </span>
                </div>
                <div className="bg-[#111111] p-5 rounded-2xl border border-slate-800/60 shadow-lg relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/10 rounded-full blur-2xl -mr-8 -mt-8" />
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest block mb-1">
                    New Matches
                  </span>
                  <span className="text-3xl font-extrabold text-indigo-400">
                    {newMatchesCount}
                  </span>
                </div>
                <div className="bg-[#111111] p-5 rounded-2xl border border-slate-800/60 shadow-lg relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl -mr-8 -mt-8" />
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest block mb-1">
                    Active Roles
                  </span>
                  <span className="text-3xl font-extrabold text-emerald-400">
                    {activeRolesCount}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* FILTER SIDEBAR */}
                <aside className="lg:col-span-3 bg-[#111111] border border-slate-800/60 rounded-2xl p-5 shadow-2xl space-y-5">
                  <div>
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-3">
                      Filters
                    </span>
                    <p className="text-xs text-slate-500">
                      Narrow the pool by experience, role, and availability.
                    </p>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 mb-1.5 uppercase tracking-wide">
                      Experience Level
                    </label>
                    <select
                      value={experienceFilter}
                      onChange={(e) => setExperienceFilter(e.target.value)}
                      className="w-full bg-[#0A0A0A] border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                    >
                      <option value="all">All Levels</option>
                      {EXPERIENCE_LEVEL_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 mb-1.5 uppercase tracking-wide">
                      Role Type
                    </label>
                    <select
                      value={roleTypeFilter}
                      onChange={(e) => setRoleTypeFilter(e.target.value)}
                      className="w-full bg-[#0A0A0A] border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                    >
                      <option value="all">All Roles</option>
                      <option value="Engineering">Engineering</option>
                      <option value="Design">Design</option>
                      <option value="Sales">Sales</option>
                      <option value="Operations">Operations</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 mb-1.5 uppercase tracking-wide">
                      Availability
                    </label>
                    <select
                      value={availabilityFilter}
                      onChange={(e) => setAvailabilityFilter(e.target.value)}
                      className="w-full bg-[#0A0A0A] border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                    >
                      <option value="all">Any Status</option>
                      <option value="Available Now">Available Now</option>
                      <option value="Interviewing">Interviewing</option>
                      <option value="Not Available">Not Available</option>
                    </select>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setExperienceFilter("all");
                      setRoleTypeFilter("all");
                      setAvailabilityFilter("all");
                      setTalentSearch("");
                    }}
                    className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold py-2.5 rounded-xl transition-all cursor-pointer"
                  >
                    Clear Filters
                  </button>
                </aside>

                {/* SEARCH + CANDIDATE GRID */}
                <div className="lg:col-span-9 space-y-4">
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500">
                      <Icons.Search />
                    </span>
                    <input
                      type="text"
                      value={talentSearch}
                      onChange={(e) => setTalentSearch(e.target.value)}
                      placeholder="Search by role or tech stack (e.g. Next.js, Python)..."
                      className="w-full bg-[#111111] border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-all"
                    />
                  </div>

                  {talentPoolLoading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                      {Array.from({ length: 3 }).map((_, index) => (
                        <div
                          key={index}
                          className="bg-[#111111] border border-slate-800/60 rounded-2xl p-5 animate-pulse min-h-[260px]"
                          aria-hidden="true"
                        >
                          <div className="flex items-start justify-between gap-2 mb-4">
                            <div className="w-12 h-12 rounded-full bg-slate-800" />
                            <div className="space-y-2">
                              <div className="h-5 w-20 rounded-full bg-slate-800" />
                              <div className="h-5 w-16 rounded-full bg-slate-800/80" />
                            </div>
                          </div>
                          <div className="space-y-2">
                            <div className="h-4 w-32 rounded bg-slate-800" />
                            <div className="h-3 w-24 rounded bg-slate-800/80" />
                            <div className="h-3 w-40 rounded bg-slate-800/60" />
                          </div>
                          <div className="flex gap-1.5 mt-6">
                            <div className="h-6 w-14 rounded-md bg-slate-800/80" />
                            <div className="h-6 w-16 rounded-md bg-slate-800/80" />
                            <div className="h-6 w-12 rounded-md bg-slate-800/80" />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : filteredCandidates.length === 0 ? (
                    <div className="bg-[#111111] border border-slate-800/60 rounded-2xl p-10 text-center">
                      <p className="text-sm font-medium text-slate-300">
                        No published candidates match your filters
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        Only verified, published candidate profiles appear here.
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-stretch">
                      {filteredCandidates.map((col) => {
                        const publicName = getCandidatePublicName(col);
                        const initials = getCandidatePublicInitials(col);
                        const introUnlocked = isCandidateUnlocked(col);

                        return (
                          <div
                            key={col.id}
                            className="bg-[#111111] border border-slate-800/60 rounded-2xl p-5 shadow-lg hover:border-slate-700 transition-all flex flex-col justify-between h-full min-h-[260px] min-w-0 overflow-hidden"
                          >
                            <div className="flex items-start justify-between gap-2 mb-4">
                              <div className="w-12 h-12 rounded-full bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-sm font-bold text-indigo-400 shrink-0">
                                {initials}
                              </div>
                              <div className="flex flex-col items-end gap-1 shrink-0">
                                <span
                                  className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${getAvailabilityBadgeClass(
                                    col.availability
                                  )}`}
                                >
                                  {col.availability}
                                </span>
                                <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 whitespace-nowrap">
                                  {getTalentMatchLabel(col)}
                                </span>
                              </div>
                            </div>

                            <div className="mb-1">
                              <h3 className="font-bold text-white text-sm">
                                {introUnlocked
                                  ? col.fullName || col.name
                                  : publicName}
                              </h3>
                              <p className="text-xs text-indigo-400 font-medium mt-0.5">
                                {col.role}
                              </p>
                              <WorkPreferenceTimezoneBadge
                                workPreference={col.workPreference}
                                timezone={col.timezone}
                                className="mt-2"
                              />
                              {!introUnlocked && (
                                <div className="mt-2">
                                  <VerifiedOnProvixPill />
                                </div>
                              )}
                              <span className="inline-flex mt-2 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                                {col.experienceLevel}
                              </span>
                              <p className="text-[11px] text-slate-500 mt-2">
                                {col.major}
                              </p>
                            </div>

                            <div className="flex flex-wrap gap-1.5 min-h-[56px] items-start mt-4">
                              {col.skills.slice(0, 3).map((skill) => (
                                <span
                                  key={skill}
                                  className="px-2 py-1 rounded-md text-[10px] font-bold bg-slate-800/80 text-slate-300 border border-slate-700/50"
                                >
                                  {skill}
                                </span>
                              ))}
                              {col.skills.length > 3 && (
                                <span className="px-2 py-0.5 text-[11px] rounded bg-white/5 text-zinc-400 border border-white/5">
                                  +{col.skills.length - 3} more
                                </span>
                              )}
                            </div>

                            <div className="flex gap-2 w-full mt-auto pt-3 min-w-0">
                              <button
                                type="button"
                                onClick={() => setSelectedCandidate(col)}
                                className="flex-1 min-w-0 py-1.5 px-2.5 text-xs font-medium text-center justify-center rounded-lg inline-flex items-center transition-all bg-slate-800 hover:bg-slate-700 text-white cursor-pointer"
                              >
                                View Profile
                              </button>
                              <button
                                type="button"
                                onClick={() => openIntroModal(col)}
                                className="flex-1 min-w-0 py-1.5 px-2.5 text-xs font-medium text-center justify-center rounded-lg inline-flex items-center gap-1 transition-all cursor-pointer bg-indigo-600 hover:bg-indigo-500 text-white"
                              >
                                Connect
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* EMPLOYER: AI SCREEN CANDIDATE */}
          {activeTab === "evaluator" && (
            <div>
              <div className="mb-8">
                <h1 className="text-3xl font-extrabold tracking-tight text-white">Employer AI Screen</h1>
                <p className="text-slate-400 text-sm mt-2">Paste a candidate's resume or project links to generate a hiring summary.</p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                <div className="lg:col-span-6 bg-[#111111] rounded-2xl border border-slate-800/60 p-7 space-y-5">
                  <input type="text" placeholder="Candidate Target Role" value={evalRole} onChange={(e) => setEvalRole(e.target.value)} className="w-full bg-[#0A0A0A] border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500" />
                  <input type="text" placeholder="Education / Major (Optional)" value={evalMajor} onChange={(e) => setEvalMajor(e.target.value)} className="w-full bg-[#0A0A0A] border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500" />
                  <textarea rows={5} placeholder="Paste Proof of Work or Resume details here..." value={evalAccomplishments} onChange={(e) => setEvalAccomplishments(e.target.value)} className="w-full bg-[#0A0A0A] border border-slate-800 rounded-xl px-4 py-3 text-sm text-white resize-none focus:outline-none focus:border-indigo-500" />
                  
                  <button onClick={evaluateCandidate} disabled={evaluatingPoW || !evalAccomplishments} className="w-full bg-white hover:bg-slate-200 text-black font-bold py-3.5 rounded-xl text-xs transition-all">
                    {evaluatingPoW ? "Processing..." : "Generate Candidate Brief"}
                  </button>
                </div>

                <div className="lg:col-span-6 bg-[#111111] rounded-2xl border border-slate-800/60 p-6 min-h-[360px]">
                  {powResult ? (
                    <div className="space-y-4">
                      <div className="flex justify-between items-center pb-4 border-b border-slate-800">
                        <div className="text-2xl font-extrabold text-white">Hire Recommended</div>
                        <div className="text-xl font-mono text-emerald-400 font-bold">92%</div>
                      </div>
                      <div className="text-sm text-slate-300 leading-relaxed">
                        <span className="font-bold text-white block mb-1">Analysis:</span>
                        This candidate balances structured education ({evalMajor || "Self-Taught"}) with strong real-world execution. The projects pasted show a high bias for action and ability to learn on the fly. Ideal fit for a {evalRole || "technical"} role.
                      </div>
                    </div>
                  ) : (
                    <div className="text-slate-500 text-center mt-28 text-sm">Awaiting candidate data...</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* EMPLOYER: PLACEMENT REVENUE */}
          {activeTab === "revenue" && (
            <div className="max-w-3xl">
              <div className="mb-8">
                <h1 className="text-3xl font-extrabold tracking-tight text-white">Placement Economics</h1>
                <p className="text-slate-400 text-sm mt-2">
                  Provix operates on a pure contingency model — no upfront subscriptions or unlock fees.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8">
                <div className="bg-[#111111] p-6 rounded-2xl border border-slate-800/60 shadow-lg">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Above $25k Roles</span>
                  <span className="text-3xl font-extrabold text-white">10%</span>
                  <p className="text-xs text-slate-400 mt-2">
                    of first-year salary upon hire
                  </p>
                </div>
                <div className="bg-[#111111] p-6 rounded-2xl border border-slate-800/60 shadow-lg relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl -mr-10 -mt-10" />
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Under $25k Roles</span>
                  <span className="text-3xl font-extrabold text-emerald-400">$2,500</span>
                  <p className="text-xs text-slate-400 mt-2">
                    flat placement fee upon hire
                  </p>
                </div>
              </div>
              <div className="bg-[#111111] border border-slate-800/60 rounded-2xl shadow-2xl p-6">
                <h3 className="text-sm font-bold text-white mb-4">How billing works</h3>
                <div className="space-y-3 text-sm text-slate-300 leading-relaxed">
                  <p>
                    Request intros for free. You only pay Provix after a successful hire is confirmed.
                  </p>
                  <p>
                    Candidate bonuses of $250–$500 may be allocated on sub-$25k placements to support verified talent.
                  </p>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* CANDIDATE SLIDE-OVER DRAWER */}
        <div className={`fixed inset-0 z-50 ${isDrawerOpen ? "" : "pointer-events-none"}`}>
          <div
            onClick={() => setSelectedCandidate(null)}
            className={`absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity duration-300 ${
              isDrawerOpen ? "opacity-100" : "opacity-0"
            }`}
          />
          <div
            className={`absolute top-0 right-0 h-full w-full max-w-md bg-[#121212] border-l border-slate-800 shadow-2xl overflow-y-auto transition-transform duration-300 ease-out ${
              isDrawerOpen ? "translate-x-0" : "translate-x-full"
            }`}
          >
            {selectedCandidate && (
              <div className="p-6 space-y-6">
                {(() => {
                  const introUnlocked = isCandidateUnlocked(selectedCandidate);
                  const publicName = getCandidatePublicName(selectedCandidate);
                  const displayName = introUnlocked
                    ? selectedCandidate.fullName || selectedCandidate.name
                    : publicName;
                  const displayInitials = introUnlocked
                    ? getCandidateInitials(displayName)
                    : getCandidatePublicInitials(selectedCandidate);
                  const projectLinks =
                    getCandidateProjectLinks(selectedCandidate);
                  const contactEmail = selectedCandidate.email?.trim() || null;
                  const contactPhone = selectedCandidate.phone?.trim() || null;

                  return (
                    <>
                {/* Header — full dossier revealed after approved intro */}
                <div className="flex items-start justify-between pb-5 border-b border-slate-800">
                  <div className="flex items-center gap-3">
                    <div className="relative w-11 h-11 rounded-full bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 flex items-center justify-center font-bold text-sm shrink-0">
                      {displayInitials}
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-white leading-tight">
                        {displayName}
                      </h3>
                      <p className="text-xs text-indigo-400 font-medium mt-0.5">
                        {selectedCandidate.role}
                      </p>
                      <WorkPreferenceTimezoneBadge
                        workPreference={selectedCandidate.workPreference}
                        timezone={selectedCandidate.timezone}
                        className="mt-2"
                      />
                      {!introUnlocked && (
                        <div className="mt-2">
                          <VerifiedOnProvixPill />
                        </div>
                      )}
                      {introUnlocked && (
                        <span className="inline-flex mt-2 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                          Introduction unlocked
                        </span>
                      )}
                      <span className="inline-flex mt-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                        {selectedCandidate.experienceLevel}
                      </span>
                      <button
                        type="button"
                        onClick={() => openIntroModal(selectedCandidate)}
                        className="mt-2.5 inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold px-3 py-1.5 rounded-lg transition-all cursor-pointer shadow-lg shadow-indigo-500/20"
                      >
                        Request Introduction
                      </button>
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedCandidate(null)}
                    className="text-slate-400 hover:text-white bg-slate-900 w-7 h-7 rounded-lg border border-slate-800 flex items-center justify-center transition-all cursor-pointer shrink-0"
                  >
                    <Icons.XMark />
                  </button>
                </div>

                {/* Status + Rating */}
                <div className="flex items-center justify-between text-xs bg-slate-900/60 px-3.5 py-2.5 rounded-xl border border-slate-800">
                  <span
                    className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${getAvailabilityBadgeClass(
                      selectedCandidate.availability
                    )}`}
                  >
                    {selectedCandidate.availability}
                  </span>
                  <span className="font-mono font-bold text-emerald-400">
                    {getTalentMatchLabel(selectedCandidate)} AI Match Score
                  </span>
                </div>

                {/* Bio */}
                <p className="text-sm text-slate-300 leading-relaxed">
                  {selectedCandidate.bio}
                </p>

                {/* Credentials */}
                <div>
                  <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-2">
                    Education & Credentials
                  </div>
                  <div className="bg-[#0A0A0A] border border-slate-800/80 rounded-xl p-3.5 text-xs text-slate-200">
                    {selectedCandidate.major}
                  </div>
                </div>

                {/* Skills */}
                <div>
                  <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-2">
                    Core Skills
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedCandidate.skills.map((skill, sIdx) => (
                      <span
                        key={sIdx}
                        className="px-2 py-1 rounded-md text-[10px] font-bold bg-slate-800/80 text-slate-300 border border-slate-700/50"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Contact + Project Links */}
                <div>
                  <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-2">
                    Contact & Proof Links
                  </div>
                  {introUnlocked ? (
                    <div className="space-y-2">
                      {contactEmail && (
                        <a
                          href={`mailto:${contactEmail}`}
                          className="w-full flex items-center justify-between bg-[#0A0A0A] border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs hover:border-indigo-500/40 transition-all"
                        >
                          <span className="text-indigo-300 font-medium">Email</span>
                          <span className="text-slate-300 break-all text-right ml-3">
                            {contactEmail}
                          </span>
                        </a>
                      )}
                      {contactPhone && (
                        <div className="w-full flex items-center justify-between bg-[#0A0A0A] border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs">
                          <span className="text-indigo-300 font-medium">Phone</span>
                          <span className="text-slate-300">{contactPhone}</span>
                        </div>
                      )}
                      {projectLinks.length === 0 ? (
                        <p className="text-xs text-slate-500 italic bg-[#0A0A0A] border border-slate-800 rounded-xl px-3.5 py-2.5">
                          No public project links provided.
                        </p>
                      ) : (
                        projectLinks.map((link) => (
                          <a
                            key={`${link.label}-${link.url}`}
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full flex items-center justify-between bg-[#0A0A0A] border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs hover:border-indigo-500/40 transition-all"
                          >
                            <span className="text-indigo-300 font-medium">
                              {link.label}
                            </span>
                            <Icons.ExternalLink />
                          </a>
                        ))
                      )}
                    </div>
                  ) : (
                    <LockedContactDossierBadge />
                  )}
                </div>

                {/* AI Deep Screening */}
                <div className="bg-[#0A0A0A] border border-slate-800/80 rounded-xl p-4 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-1">
                        Gemini Deep Screening
                      </div>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        Run live GitHub artifact audits and integrity scoring for this candidate.
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={runDeepScreening}
                    disabled={hasBetaAccess && deepScreeningLoading}
                    className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg text-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {deepScreeningLoading ? (
                      <>
                        <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Running live audit…
                      </>
                    ) : isProEmployerAccount ? (
                      deepScreeningShowResults
                        ? "Re-run Live Audit"
                        : "Generate AI Deep Screening"
                    ) : (
                      <>
                        <Lock className="w-3.5 h-3.5" aria-hidden />
                        Unlock AI Deep Screening
                      </>
                    )}
                  </button>

                  {!hasBetaAccess && (
                    <p className="text-[11px] text-slate-400">
                      Unlock beta access to enable deep screening.
                    </p>
                  )}

                  {hasBetaAccess && deepScreeningLoading && (
                    <div className="space-y-2.5 pt-1">
                      {DEEP_SCREENING_STAGES.map((stageLabel, index) => {
                        const isComplete = index < deepScreeningStage;
                        const isActive = index === deepScreeningStage;

                        return (
                          <div
                            key={stageLabel}
                            className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 transition-all duration-300 ${
                              isComplete
                                ? "border-emerald-500/25 bg-emerald-500/5"
                                : isActive
                                  ? "border-indigo-500/30 bg-indigo-500/10"
                                  : "border-slate-800 bg-[#0A0A0A]"
                            }`}
                          >
                            <span
                              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold ${
                                isComplete
                                  ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-400"
                                  : isActive
                                    ? "border-indigo-500/40 bg-indigo-500/15 text-indigo-300"
                                    : "border-slate-700 text-slate-600"
                              }`}
                            >
                              {isComplete ? (
                                <Check className="h-3 w-3" aria-hidden />
                              ) : isActive ? (
                                <span className="h-2 w-2 rounded-full bg-indigo-400 animate-pulse" />
                              ) : (
                                index + 1
                              )}
                            </span>
                            <p
                              className={`text-xs leading-relaxed ${
                                isComplete
                                  ? "text-emerald-200"
                                  : isActive
                                    ? "text-indigo-100"
                                    : "text-slate-500"
                              }`}
                            >
                              {stageLabel}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {hasBetaAccess && deepScreeningError && !deepScreeningLoading && (
                    <div className="rounded-xl border border-red-500/25 bg-red-500/5 p-4 space-y-3">
                      <p className="text-xs text-red-200 leading-relaxed">
                        {deepScreeningError}
                      </p>
                      <button
                        type="button"
                        onClick={runDeepScreening}
                        className="w-full bg-red-500/10 hover:bg-red-500/15 border border-red-500/25 text-red-200 font-semibold py-2 rounded-lg text-xs transition-all cursor-pointer"
                      >
                        Retry Live Audit
                      </button>
                    </div>
                  )}

                  {hasBetaAccess &&
                    deepScreeningShowResults &&
                    deepScreeningResult &&
                    !deepScreeningLoading && (
                    <div className="space-y-4 pt-1 animate-in fade-in duration-500">
                      <div
                        className={`rounded-xl border p-4 text-center ${getIntegrityScoreClass(deepScreeningResult.integrity_score)}`}
                      >
                        <div className="text-[10px] uppercase font-bold tracking-widest mb-1">
                          Integrity Score
                        </div>
                        <div className="text-4xl font-extrabold">
                          {deepScreeningResult.integrity_score}
                          <span className="text-lg font-semibold opacity-70">
                            /100
                          </span>
                        </div>
                        {deepScreeningResult.github_audit && (
                          <p className="text-[11px] mt-2 opacity-80">
                            Live audit: {deepScreeningResult.github_audit.owner}/
                            {deepScreeningResult.github_audit.repo}
                            {deepScreeningResult.github_audit.language
                              ? ` · ${deepScreeningResult.github_audit.language}`
                              : ""}
                          </p>
                        )}
                      </div>

                      {deepScreeningResult.timeline_flags.length > 0 && (
                        <div>
                          <div className="text-[10px] uppercase font-bold text-red-400 tracking-wider mb-2">
                            Timeline &amp; Repository Flags
                          </div>
                          <ul className="space-y-1.5">
                            {deepScreeningResult.timeline_flags.map(
                              (flag, index) => (
                                <li
                                  key={`flag-${index}`}
                                  className="text-xs text-red-200 leading-relaxed bg-red-500/5 border border-red-500/20 rounded-lg px-3 py-2"
                                >
                                  {flag}
                                </li>
                              )
                            )}
                          </ul>
                        </div>
                      )}

                      <div>
                        <div className="text-[10px] uppercase font-bold text-indigo-300 tracking-wider mb-2">
                          Artifact Analysis (Check 1)
                        </div>
                        <p className="text-xs text-slate-300 leading-relaxed bg-indigo-500/5 border border-indigo-500/10 rounded-lg px-3 py-2">
                          {deepScreeningResult.artifact_analysis}
                        </p>
                      </div>

                      <div>
                        <div className="text-[10px] uppercase font-bold text-purple-300 tracking-wider mb-2">
                          Employer Interview Cheat Sheet
                        </div>
                        <div className="space-y-3">
                          {(deepScreeningResult.interview_questions ?? []).map(
                            (item, index) => (
                              <div
                                key={`interview-question-${index}`}
                                className="bg-[#0A0A0A] border border-slate-800 rounded-xl p-3.5 space-y-2.5"
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <span className="inline-flex px-2 py-1 rounded-md text-[10px] font-bold bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 shrink-0">
                                    {item.category}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleCopyInterviewQuestion(item.question)
                                    }
                                    className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-400 hover:text-white transition-colors cursor-pointer shrink-0"
                                  >
                                    <Copy className="w-3 h-3" aria-hidden />
                                    Copy Question
                                  </button>
                                </div>
                                <p className="text-xs text-white font-medium leading-relaxed">
                                  {item.question}
                                </p>
                                <div className="pt-2 border-t border-slate-800/80">
                                  <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-1">
                                    What to listen for
                                  </p>
                                  <p className="text-[11px] text-slate-400 leading-relaxed">
                                    {item.what_to_listen_for}
                                  </p>
                                </div>
                              </div>
                            )
                          )}
                        </div>
                      </div>

                      <div>
                        <div className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider mb-2">
                          Technical Depth Summary
                        </div>
                        <p className="text-xs text-slate-300 leading-relaxed bg-emerald-500/5 border border-emerald-500/10 rounded-lg px-3 py-2">
                          {deepScreeningResult.technical_depth_summary}
                        </p>
                      </div>

                      {deepScreeningResult.github_audit?.fetch_warnings &&
                        deepScreeningResult.github_audit.fetch_warnings.length >
                          0 && (
                          <div>
                            <div className="text-[10px] uppercase font-bold text-amber-400 tracking-wider mb-2">
                              GitHub Fetch Warnings
                            </div>
                            <ul className="space-y-1.5">
                              {deepScreeningResult.github_audit.fetch_warnings.map(
                                (warning, index) => (
                                  <li
                                    key={`gh-warning-${index}`}
                                    className="text-xs text-amber-200 leading-relaxed bg-amber-500/5 border border-amber-500/15 rounded-lg px-3 py-2"
                                  >
                                    {warning}
                                  </li>
                                )
                              )}
                            </ul>
                          </div>
                        )}
                    </div>
                  )}
                </div>
                <div>
                  <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-2">
                    Audited Proof-of-Work Breakdown
                  </div>
                  <ul className="space-y-2">
                    {selectedCandidate.projects.map((project, pIdx) => (
                      <li
                        key={pIdx}
                        className="text-xs text-slate-300 leading-relaxed bg-[#0A0A0A] border border-slate-800/80 rounded-xl p-3.5"
                      >
                        {project}
                      </li>
                    ))}
                  </ul>
                </div>

                <button
                  type="button"
                  onClick={() => openIntroModal(selectedCandidate)}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3.5 rounded-xl text-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  Request Introduction
                </button>
                    </>
                  );
                })()}
              </div>
            )}
          </div>
        </div>

        {/* PUBLIC PROFILE MODAL */}
        {showPublicProfile && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-[#121212] border border-slate-800 rounded-2xl max-w-xl w-full p-6 relative shadow-2xl overflow-hidden">
              {/* Header / Title */}
              <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-800">
                <div>
                  <h3 className="text-lg font-bold text-white">
                    {isBusinessAccount ? "Your Shareable Company Card" : "Your Shareable Profile Card"}
                  </h3>
                  <p className="text-slate-400 text-xs mt-0.5">
                    {isBusinessAccount
                      ? "This is what candidates see when you share your company link."
                      : "This is what clients and agencies see when you share your link."}
                  </p>
                </div>

                <button
                  onClick={() => setShowPublicProfile(false)}
                  className="text-slate-400 hover:text-white bg-slate-900 w-7 h-7 rounded-lg border border-slate-800 flex items-center justify-center transition-all cursor-pointer"
                >
                  <Icons.XMark />
                </button>
              </div>

              {/* Profile Card Preview */}
              {isBusinessAccount ? (
                <div className="bg-[#0A0A0A] border border-slate-800/80 rounded-xl p-5 mb-5 space-y-4">
                  {/* Business Identity */}
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 flex items-center justify-center font-bold text-lg">
                      {businessInitials}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white">
                        {businessProfileData.businessName}
                      </h4>
                      <p className="text-xs text-slate-400">{businessProfileData.industry}</p>
                    </div>
                  </div>

                  {/* Company Bio */}
                  <p className="text-xs text-slate-300 leading-relaxed">
                    {businessProfileData.companyBio}
                  </p>

                  {/* Active Roles */}
                  <div className="flex items-center justify-between text-xs bg-slate-900/80 px-3 py-2 rounded-lg border border-slate-800">
                    <span className="text-slate-300">Active Roles</span>
                    <span className="text-emerald-400 font-mono font-bold">{activeRolesCount}</span>
                  </div>

                  {/* Industry */}
                  <div>
                    <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-1">
                      Industry
                    </div>
                    <div className="text-xs font-semibold text-slate-200">
                      {businessProfileData.industry}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-[#0A0A0A] border border-slate-800/80 rounded-xl p-5 mb-5 space-y-4">
                  {/* User Bio */}
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 flex items-center justify-center font-bold text-lg">
                      {profileInitials}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white">
                        {profileData.name}
                      </h4>
                      <p className="text-xs text-slate-400">{title}</p>
                    </div>
                  </div>

                  {/* Bio */}
                  <p className="text-xs text-slate-300 leading-relaxed">
                    {bio}
                  </p>

                  {/* Status */}
                  <div className="flex items-center justify-between text-xs bg-slate-900/80 px-3 py-2 rounded-lg border border-slate-800">
                    <span className="text-slate-300">
                      Availability:{" "}
                      <strong
                        className={
                          availabilityStatus === "Available Now"
                            ? "text-emerald-400"
                            : availabilityStatus === "Interviewing"
                              ? "text-amber-400"
                              : "text-slate-400"
                        }
                      >
                        {availabilityStatus}
                      </strong>
                    </span>
                    <span className="text-slate-400 font-mono">10–15 hrs/wk</span>
                  </div>

                  {/* Verified Project */}
                  <div>
                    <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-1">
                      Featured Project
                    </div>
                    <div className="text-xs font-semibold text-slate-200">
                      {featuredProjectTitle}
                    </div>
                    {featuredProjectDetail && (
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {featuredProjectDetail}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Link Sharing Action */}
              <div className="space-y-2">
                <label className="text-[11px] font-medium text-slate-400">
                  Your Public Link
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={isBusinessAccount ? publicBusinessProfileUrl : publicProfileUrl}
                    className="flex-1 bg-[#0A0A0A] border border-slate-800 text-slate-300 text-xs px-3 py-2.5 rounded-xl font-mono focus:outline-none"
                  />
                  <button
                    onClick={() => {
                      const origin =
                        typeof window !== "undefined"
                          ? window.location.origin
                          : appOrigin;
                      const linkToCopy = isBusinessAccount
                        ? `${origin}/c/${businessSlug}`
                        : `${origin}/p/${profileSlug}`;
                      navigator.clipboard.writeText(linkToCopy);
                      showToast("Link copied to clipboard!");
                    }}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs px-4 py-2.5 rounded-xl transition-all cursor-pointer whitespace-nowrap"
                  >
                    Copy Link
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {toastMessage && (
          <div className="fixed bottom-6 right-6 z-50 bg-[#18181b] border border-slate-700 text-slate-100 text-xs font-medium px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3">
            <span className="w-5 h-5 rounded-full bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0">
              <Icons.Check />
            </span>
            <span>{toastMessage}</span>
          </div>
        )}

        {/* POST NEW JOB MODAL (Employer) */}
        {postJobModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-[#111111] border border-slate-800 rounded-2xl p-8 max-w-lg w-full relative shadow-2xl">
              <button
                type="button"
                onClick={() => {
                  setPostJobModalOpen(false);
                  resetNewJobForm();
                }}
                disabled={isCreatingJob}
                className="absolute top-4 right-4 text-slate-500 hover:text-white transition-colors cursor-pointer disabled:opacity-50"
              >
                <Icons.XMark />
              </button>

              <p className="text-xs font-bold uppercase tracking-widest text-indigo-400 mb-2">
                Employer Console
              </p>
              <h3 className="text-xl font-extrabold text-white">Post New Job</h3>
              <p className="text-sm text-slate-400 mt-2 mb-6">
                Publish a role to the Provix opportunities feed.
              </p>

              <form onSubmit={handleCreateJob} className="space-y-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 mb-2 uppercase">
                    Job Title
                  </label>
                  <input
                    type="text"
                    value={newJobTitle}
                    onChange={(e) => setNewJobTitle(e.target.value)}
                    placeholder="Senior Frontend Engineer"
                    required
                    className="w-full bg-[#0A0A0A] border border-slate-800 rounded-xl p-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-400 mb-2 uppercase">
                    Company Name
                  </label>
                  <input
                    type="text"
                    value={newJobCompany}
                    onChange={(e) => setNewJobCompany(e.target.value)}
                    placeholder="Your company"
                    className="w-full bg-[#0A0A0A] border border-slate-800 rounded-xl p-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 mb-2 uppercase">
                      Location
                    </label>
                    <input
                      type="text"
                      value={newJobLocation}
                      onChange={(e) => setNewJobLocation(e.target.value)}
                      placeholder="Remote · US"
                      className="w-full bg-[#0A0A0A] border border-slate-800 rounded-xl p-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 mb-2 uppercase">
                      Salary Range
                    </label>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">
                        $
                      </span>
                      <input
                        type="text"
                        value={newJobSalaryRange}
                        onChange={(e) => setNewJobSalaryRange(e.target.value)}
                        placeholder="80,000 - 100,000 / yr"
                        className="w-full bg-[#0A0A0A] border border-slate-800 rounded-xl py-3 pr-3 pl-7 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <p className="text-[11px] text-slate-500 mt-2">
                      Example: $80,000 - $100,000 / yr (80k-100k also works)
                    </p>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-400 mb-2 uppercase">
                    Required Skills / Tags
                  </label>
                  <input
                    type="text"
                    value={newJobTags}
                    onChange={(e) => setNewJobTags(e.target.value)}
                    placeholder="React, TypeScript, Next.js"
                    className="w-full bg-[#0A0A0A] border border-slate-800 rounded-xl p-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                  />
                  <p className="text-[11px] text-slate-500 mt-2">
                    Comma-separated skills shown on the job card.
                  </p>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setPostJobModalOpen(false);
                      resetNewJobForm();
                    }}
                    disabled={isCreatingJob}
                    className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-3 rounded-xl text-xs transition-all cursor-pointer disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isCreatingJob}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-xl text-xs transition-all shadow-lg shadow-indigo-500/20 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {isCreatingJob ? "Posting..." : "Post Job"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        <JobApplicantsDrawer
          open={Boolean(applicantsDrawerJob)}
          jobId={applicantsDrawerJob?.id ?? null}
          jobTitle={applicantsDrawerJob?.title ?? "Role"}
          employerId={user?.id ?? null}
          onClose={() => setApplicantsDrawerJob(null)}
          onRequestIntro={handleApplicantIntroRequest}
        />

        <RequestIntroModal
          open={Boolean(introModalCandidate)}
          defaultRoleTitle={introDefaultRoleTitle}
          candidate={
            introModalCandidate
              ? {
                  id: introModalCandidate.id,
                  profileId: introModalCandidate.profileId,
                  name: getCandidatePublicName(introModalCandidate),
                }
              : null
          }
          onClose={() => {
            setIntroModalCandidate(null);
            setIntroDefaultRoleTitle("");
          }}
          onSuccess={handleIntroRequestSuccess}
        />

        {/* UPGRADE / BETA ACCESS MODAL (employer unlock) */}
        {proUpgradeModalOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 max-w-md w-full relative">
              <button
                type="button"
                onClick={() => setProUpgradeModalOpen(false)}
                className="absolute top-4 right-4 text-slate-500 hover:text-white transition-colors cursor-pointer"
              >
                <Icons.XMark />
              </button>

              <div className="w-12 h-12 rounded-full bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 flex items-center justify-center mb-4">
                <Sparkles className="w-5 h-5" aria-hidden />
              </div>

              <h3 className="text-xl font-bold text-white leading-tight">
                Hire Vetted Talent with Zero Upfront Cost
              </h3>
              <p className="text-sm text-slate-400 mt-2 leading-relaxed">
                Browse profiles, view proof-of-work, and generate Gemini Deep
                Screenings for free during our beta.
              </p>

              <div className="mt-6 space-y-3">
                <div className="bg-zinc-950/80 border border-zinc-800 rounded-xl p-3.5 flex gap-3">
                  <Sparkles className="w-4 h-4 shrink-0 text-indigo-400 mt-0.5" aria-hidden />
                  <div>
                    <p className="text-xs font-bold text-white">
                      Contingency Placement Model
                    </p>
                    <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                      No upfront fees. Pay 10% on hire above $25k or a $2,500
                      flat fee below that threshold.
                    </p>
                  </div>
                </div>
                <div className="bg-zinc-950/80 border border-zinc-800 rounded-xl p-3.5 flex gap-3">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-indigo-400 mt-0.5" aria-hidden />
                  <div>
                    <p className="text-xs font-bold text-white">
                      Contract / Hourly Hires
                    </p>
                    <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                      Transparent, low-margin hourly rates with built-in
                      contractor management.
                    </p>
                  </div>
                </div>
                <div className="bg-zinc-950/80 border border-zinc-800 rounded-xl p-3.5 flex gap-3">
                  <ShieldCheck className="w-4 h-4 shrink-0 text-indigo-400 mt-0.5" aria-hidden />
                  <div>
                    <p className="text-xs font-bold text-white">
                      Full-Time Placements
                    </p>
                    <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                      12% success fee only when you officially hire, backed by a
                      60-day replacement guarantee.
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-6 space-y-3">
                <div>
                  <label
                    htmlFor="beta-company-name"
                    className="block text-[11px] font-bold uppercase tracking-widest text-zinc-500 mb-1.5"
                  >
                    Company Name
                  </label>
                  <input
                    id="beta-company-name"
                    type="text"
                    value={betaCompanyName}
                    onChange={(e) => setBetaCompanyName(e.target.value)}
                    placeholder="Acme Talent Partners"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-indigo-500 transition-all"
                  />
                </div>
                <div>
                  <label
                    htmlFor="beta-work-email"
                    className="block text-[11px] font-bold uppercase tracking-widest text-zinc-500 mb-1.5"
                  >
                    Work Email
                  </label>
                  <input
                    id="beta-work-email"
                    type="email"
                    value={betaWorkEmail}
                    onChange={(e) => {
                      setBetaWorkEmail(e.target.value);
                      if (betaAccessError) {
                        setBetaAccessError(null);
                      }
                    }}
                    placeholder="hiring@company.com"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-indigo-500 transition-all"
                  />
                  {betaAccessError && (
                    <p className="text-[11px] text-red-400 mt-1.5">{betaAccessError}</p>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={handleUnlockBetaAccess}
                disabled={betaAccessSubmitting}
                className="w-full mt-6 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-lg text-sm transition-all shadow-lg shadow-indigo-500/20 cursor-pointer"
              >
                {betaAccessSubmitting
                  ? "Unlocking..."
                  : "Unlock Early Beta Access"}
              </button>
            </div>
          </div>
        )}

    </>
  );
}