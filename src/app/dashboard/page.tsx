"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import {
  AlertTriangle,
  Check,
  Copy,
  FileText,
  Flame,
  ShieldCheck,
  Target,
  Trash2,
} from "lucide-react";
import type { CollegeFitResult } from "@/app/api/college-fit/route";
import type { AuditResult } from "@/app/api/audit/route";
import RequestIntroModal from "@/components/RequestIntroModal";
import JobApplicantsDrawer, {
  type JobApplicantView,
} from "@/components/JobApplicantsDrawer";
import CandidateIntelligenceDrawer from "@/components/employer/candidate-intelligence-drawer";
import EmployerApplicantsSection from "@/components/employer/employer-applicants-section";
import {
  mapApplicantToTalentCandidate,
  type EmployerApplicantView,
} from "@/lib/job-applicants";
import {
  formatExternalUrl,
  formatTalentMatchLabel,
  type TalentPoolCandidate,
} from "@/lib/talent-pool-candidate";
import CandidateIntroRequestsPanel from "@/components/dashboard/candidate-intro-requests-panel";
import { useDashboardNav } from "@/components/dashboard/dashboard-nav-context";
import DashboardSkeleton from "@/components/dashboard/dashboard-skeleton";
import GuestAuthModal from "@/components/GuestAuthModal";
import MobileAppHeader from "@/components/dashboard/mobile-app-header";
import { ProvixLogo } from "@/components/ProvixLogo";
import ResumeFileUpload from "@/components/ResumeFileUpload";
import ExternalProjectsForm from "@/components/portfolio/external-projects-form";
import VerifiedOnProvixPill from "@/components/VerifiedOnProvixPill";
import ShareProfileButton from "@/components/dashboard/ShareProfileButton";
import Toast, { inferToastVariant, type ToastVariant } from "@/components/Toast";
import { buildAlliterativeAliasIdentity } from "@/lib/alias-generator";
import {
  normalizeAccountKind,
  resolveAccountRole,
  profileDefaultsForAccountRole,
} from "@/lib/account-role";
import {
  getPublicCandidateInitials,
  getPublicCandidateLocation,
  collectUnlockedCandidateIds,
  isIntroUnlockedForCandidate,
  redactPersonalNamesFromText,
} from "@/lib/candidate-anonymization";
import { signOutAndClearSession } from "@/lib/sign-out";
import { buildProfileSlug, buildUniqueProfileSlug } from "@/lib/profile-slug";
import {
  buildCandidateProfileUpdatePayload,
  persistCandidatePoolVisibility,
  persistCandidateProfile,
} from "@/lib/persist-candidate-profile";
import { createClient } from "@/utils/supabase/client";
import { fetchWithAuth } from "@/lib/fetch-with-auth";
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
  getGitHubUrlValidationMessage,
  isValidGitHubUrl,
  normalizeGitHubUrl,
} from "@/lib/validate-github-url";
import { buildFallbackMatch, isCannedMatchScore, scoreTalentMatch, type MatchResult } from "@/lib/match-heuristic";
import {
  getFitVerdictBadgeClass,
  type OpportunityMatchResult,
} from "@/lib/opportunity-match";
import {
  CANDIDATE_INTRO_REQUEST_PUBLIC_COLUMNS,
  CANDIDATE_INTRO_REQUEST_PUBLIC_COLUMNS_FALLBACK,
  normalizeCandidateIntroStatus,
  type CandidateIntroRequestRow,
} from "@/lib/candidate-intro-requests";
import { submitCandidateJobInterest } from "@/lib/job-interest";
import {
  fetchTalentMatchInsight,
  loadCachedTalentMatchScores,
  saveTalentMatchScore,
} from "@/lib/talent-match-scores";
import {
  candidateEducationFields,
  educationFromProfileRow,
  fetchCandidateEducationForEmployer,
  fetchEmployerTalentPoolProfiles,
  hasTalentEducation,
  hydrateRowsWithEducation,
  mergeTalentEducation,
  resolveTalentProfileId,
  type TalentPoolEducation,
  type TalentPoolProfileRow,
} from "@/lib/talent-pool-profiles";
import { fetchProfileForCandidateId } from "@/lib/resolve-candidate-profile";
import {
  ensureTalentPoolVisibilityChannel,
  publishTalentPoolVisibility,
  subscribeTalentPoolVisibility,
} from "@/lib/talent-pool-visibility-sync";
import {
  fetchDashboardJobs,
  jobDisplayTags,
  parseJobListInput,
  type JobRow,
} from "@/lib/jobs";
import OpportunitiesJobFeed from "@/components/opportunities/opportunities-job-feed";
import { useProvixAiMatch } from "@/components/opportunities/use-provix-ai-match";
import {
  countActiveOpenings,
  getActiveJobs,
  isVisibleToEmployers,
  profileRowIsPublicToEmployers,
} from "@/lib/opportunities-metrics";
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
import { isVerifiedOnProvix } from "@/lib/published-candidate-profile";
import WorkPreferenceTimezoneBadge from "@/components/WorkPreferenceTimezoneBadge";
import {
  hydrateEmployerProfileFromRow,
  persistEmployerProfile,
  type EmployerProfileFormData,
} from "@/lib/persist-employer-profile";
import { employerIsVerifiedInDatabase } from "@/lib/persist-employer-verified";
import { getCorporateWorkEmailValidationMessage } from "@/lib/corporate-email";
import { isSupabaseSchemaError } from "@/lib/supabase-schema-errors";
import {
  dashboardTabFromSearchParam,
  type DashboardTab,
} from "@/lib/dashboard-account";
import { clampScore0to100 } from "@/lib/score-scale";
import { formatGpa, isGpaDraft } from "@/lib/gpa";
import ScoreMeter from "@/components/ScoreMeter";
import AuditResultsPanel from "@/components/auditor/audit-results-panel";
import GitHubResumeAuditor from "@/components/auditor/github-resume-auditor";

const PROFILE_STORAGE_KEY = "vanguardx_profile_data";

const COLLEGE_FIT_STAGES = [
  "Analyzing academic stats...",
  "Evaluating reach & target programs...",
  "Building tailored strategy breakdown...",
] as const;

const EMPTY_PROFILE_DATA = {
  name: "",
  role: "",
  bio: "",
  school: "",
  degree: "",
  gpa: "",
  gradYear: "",
  github: "",
  demoVideo: "",
  projects: "",
};

const EMPTY_BUSINESS_PROFILE_DATA: EmployerProfileFormData = {
  businessName: "",
  industry: "",
  companyBio: "",
  workEmail: "",
  phone: "",
  billingPlan: "Free Plan",
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

type ProfileRecord = {
  id: string | null;
  user_id?: string | null;
  full_name: string | null;
  role: string | null;
  graduation_year: number | null;
  gpa?: string | number | null;
  key_accomplishments?: string | null;
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
  resume_filename?: string | null;
  resume_uploaded_at?: string | null;
  experience_level?: string | null;
  availability_status?: string | null;
  is_visible_in_pool?: boolean | null;
  visible_to_employers?: boolean | null;
  company_name?: string | null;
  industry?: string | null;
  tier?: string | null;
  is_pro?: boolean | null;
  phone?: string | null;
  linkedin_url?: string | null;
  contact_email?: string | null;
  email?: string | null;
  is_verified?: boolean | null;
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
  role_type?: string | null;
  integrity_score?: number | null;
  audit_data?: unknown;
  daily_scans?: number | null;
  last_scan_date?: string | null;
};

type MatchInsight = OpportunityMatchResult;

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

function isMissingColumnError(error: { message?: string; code?: string } | null) {
  if (!error) return false;
  return (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    (error.message?.includes("does not exist") ?? false)
  );
}

function formatTalentEducationLines(candidate: {
  university: string;
  major: string;
  gpa: string;
  graduationYear: string;
}): string[] {
  return [
    candidate.university,
    candidate.major,
    formatGpa(candidate.gpa) ? `GPA ${formatGpa(candidate.gpa)}` : "",
    candidate.graduationYear ? `Class of ${candidate.graduationYear}` : "",
  ].filter(Boolean);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value
  );
}

function isEmployerRole(role: string | null | undefined): boolean {
  return role === "employer" || role === "business";
}

function isEmployeeRole(role: string | null | undefined): boolean {
  return role === "employee";
}

function canAccessTalentPool(
  role: string | null | undefined,
  isVerified?: boolean | null
): boolean {
  if (!isEmployerRole(role)) {
    return false;
  }
  return isVerified === true;
}

function isProfileEligibleForTalentPool(row: ProfileRecord): boolean {
  if (!row.id?.trim()) {
    return false;
  }

  if (isEmployerRole(row.role)) {
    return false;
  }

  return profileRowIsPublicToEmployers(row);
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
    candidate.headline,
    candidate.role,
    candidate.university,
    candidate.major,
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
    ? row.skills
        .map((skill) => skill?.trim() || "")
        .filter(Boolean)
    : [];
  const portfolioUrl = row.portfolio_url?.trim() || "";
  const isLinkedIn = portfolioUrl.toLowerCase().includes("linkedin");
  const shortId = (row.id?.replace(/-/g, "") || "").slice(0, 3).toUpperCase();
  const profileId = row.id || "";
  const identity = buildAlliterativeAliasIdentity(profileId);
  const rawFullName =
    row.full_name?.trim() ||
    row.name?.trim() ||
    [row.first_name?.trim() || "", row.last_name?.trim() || ""]
      .filter(Boolean)
      .join(" ") ||
    "";
  const headline = row.job_title?.trim() || "";
  const availability = resolveProfileAvailability(row);
  const integrityScore =
    typeof row.integrity_score === "number" &&
    Number.isFinite(row.integrity_score)
      ? clampScore0to100(row.integrity_score)
      : null;
  const education = educationFromProfileRow(
    row as unknown as Record<string, unknown>
  );
  const university = education.university;
  const major = education.major;
  const gpa = education.gpa;
  const graduationYear = education.graduationYear;
  const bio = redactPersonalNamesFromText(
    row.bio?.trim() || "",
    {
      fullName: rawFullName,
      name: row.name,
      firstName: row.first_name,
      lastName: row.last_name,
      profileName: row.name,
    },
    identity.alias
  );

  return {
    id: `C-${shortId}`,
    profileId,
    name: identity.alias,
    fullName: identity.alias,
    profileName: identity.alias,
    firstName: identity.firstName,
    lastName: identity.lastName,
    headline,
    codenameAlias: identity.alias,
    country: row.country?.trim() || "",
    timezone: normalizeCandidateTimezone(row.timezone) || "",
    workPreference: normalizeWorkPreference(row.work_preference) || "",
    email: resolveProfileContactEmail(row) || "",
    phone: row.phone?.trim() || "",
    linkedin_url: row.linkedin_url?.trim() || (isLinkedIn ? portfolioUrl : "") || "",
    github_url: !isLinkedIn && portfolioUrl ? portfolioUrl : "",
    role: headline,
    university,
    major,
    gpa,
    graduationYear,
    skills,
    rating: integrityScore !== null ? `${integrityScore}%` : "",
    execution_score: integrityScore,
    status: availability || "",
    experienceLevel: row.experience_level?.trim() || "",
    roleType: row.role_type?.trim() || "",
    availability: availability || "",
    bio,
    github: portfolioUrl || "",
    demoVideo: row.youtube_url?.trim() || "",
    projects: (row.key_accomplishments ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean),
    verifiedOnProvix: isVerifiedOnProvix(row),
    matchScore: scoreTalentMatch(
      {
        title: headline,
        bio,
        skills,
        degree: major,
      },
      { title: "", tags: [], description: "", searchQuery: "" }
    ).match_percentage,
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

type MatchingJob = {
  id: string;
  title: string;
  company?: string | null;
  tags?: string[] | null;
  tech_stack?: string[] | null;
  required_skills?: string[] | null;
  location?: string | null;
  description?: string | null;
};

function buildTalentMatchJobPayload(
  job: MatchingJob | null,
  searchQuery: string
): {
  title: string;
  company: string;
  tags: string[];
  tech_stack: string[];
  required_skills: string[];
  location: string;
  description: string;
  searchQuery: string;
} {
  const query = searchQuery.trim();
  return {
    title: job?.title ?? (query || "Open talent search"),
    company: job?.company ?? "",
    tags: jobDisplayTags(job ?? {}),
    tech_stack: parseJobListInput(job?.tech_stack),
    required_skills: parseJobListInput(job?.required_skills),
    location: job?.location ?? "",
    description: job?.description ?? "",
    searchQuery: query,
  };
}

function isLegacyCannedMatchScore(score: number): boolean {
  return isCannedMatchScore(score);
}

function buildTalentMatchKey(candidateId: string, jobId: string | null) {
  return `${candidateId}:${jobId ?? "default"}`;
}

function getTalentMatchId(
  candidate: Pick<TalentPoolCandidate, "id" | "profileId">
): string {
  const profileId = candidate.profileId?.trim();
  return profileId || candidate.id;
}

function applyCachedTalentEducation(
  candidate: TalentPoolCandidate,
  cache: Map<string, TalentPoolEducation>
): TalentPoolCandidate {
  const extra =
    cache.get(resolveTalentProfileId(candidate)) ||
    cache.get(getTalentMatchId(candidate));
  if (!extra) {
    return candidate;
  }

  return {
    ...candidate,
    ...mergeTalentEducation(candidateEducationFields(candidate), extra),
  };
}

type TalentPoolLoadFn = (opts?: { silent?: boolean }) => Promise<void>;

async function fetchProfileRow(
  supabase: ReturnType<typeof createClient>,
  userId: string
) {
  const resolved = await fetchProfileForCandidateId(supabase, userId, "*");
  if (resolved) {
    return { data: resolved as ProfileRecord, error: null };
  }

  const byId = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (!byId.error && byId.data) {
    const [hydrated] = await hydrateRowsWithEducation(supabase, [
      byId.data as Record<string, unknown>,
    ]);
    return { data: hydrated as ProfileRecord, error: null };
  }

  const byUserId = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (!byUserId.error && byUserId.data) {
    const [hydrated] = await hydrateRowsWithEducation(supabase, [
      byUserId.data as Record<string, unknown>,
    ]);
    return { data: hydrated as ProfileRecord, error: null };
  }

  return byId.error ? byId : byUserId;
}

async function ensureUserProfile(
  supabase: ReturnType<typeof createClient>,
  user: User
): Promise<ProfileRecord | null> {
  const existing = await fetchProfileRow(supabase, user.id);

  if (!existing.error && existing.data) {
    const profile = existing.data as ProfileRecord;
    const metadataRole = resolveAccountRole(null, user);
    const shouldBeEmployer = normalizeAccountKind(metadataRole) === "employer";
    const storedAsEmployer = normalizeAccountKind(profile.role) === "employer";

    if (shouldBeEmployer && !storedAsEmployer) {
      const { data: repaired, error: repairError } = await supabase
        .from("profiles")
        .update({
          role: "employer",
          is_visible_in_pool: false,
          is_verified: false,
        })
        .eq("id", user.id)
        .select("*")
        .maybeSingle();

      if (!repairError && repaired) {
        return repaired as ProfileRecord;
      }
    }

    return profile;
  }

  if (existing.error) {
    const retry = await fetchProfileRow(supabase, user.id);
    if (!retry.error && retry.data) {
      return retry.data as ProfileRecord;
    }

    console.warn(
      "Profile fetch failed — creating fallback profile:",
      existing.error.message
    );
  }

  const fullName =
    displayNameFromSources(null, user) ||
    user.email?.split("@")[0] ||
    "New User";
  const { role, is_visible_in_pool } = profileDefaultsForAccountRole(
    resolveAccountRole(null, user)
  );

  const extendedPayload = {
    id: user.id,
    full_name: fullName,
    role,
    is_visible_in_pool,
    is_verified: false,
  };

  let insertResult = await supabase
    .from("profiles")
    .insert(extendedPayload)
    .select("*")
    .maybeSingle();

  if (insertResult.error?.code === "23505") {
    const refetch = await fetchProfileRow(supabase, user.id);
    return (refetch.data as ProfileRecord | null) ?? null;
  }

  if (insertResult.error && isMissingColumnError(insertResult.error)) {
    insertResult = await supabase
      .from("profiles")
      .insert({ id: user.id, full_name: fullName, role })
      .select("*")
      .maybeSingle();

    if (insertResult.error?.code === "23505") {
      const refetch = await fetchProfileRow(supabase, user.id);
      return (refetch.data as ProfileRecord | null) ?? null;
    }
  }

  if (insertResult.error) {
    console.error("Fallback profile insert failed:", insertResult.error.message);
    return null;
  }

  return (insertResult.data as ProfileRecord | null) ?? null;
}

const AUTH_BOOTSTRAP_TIMEOUT_MS = 8000;

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

export default function DashboardPage() {
  const router = useRouter();
  let dashboardNav: ReturnType<typeof useDashboardNav> | null = null;
  try {
    dashboardNav = useDashboardNav();
  } catch {
    dashboardNav = null;
  }

  const [fallbackActiveTab, setFallbackActiveTab] =
    useState<DashboardTab>("opportunities");
  const activeTab = dashboardNav?.activeTab ?? fallbackActiveTab;
  const navSetActiveTab = dashboardNav?.setActiveTab;
  const navSetDefaultTab = dashboardNav?.setDefaultTab;
  const navSetMobileNavOpen = dashboardNav?.setMobileNavOpen;
  const navSetAccountRole = dashboardNav?.setAccountRole;
  const navSetIsVerifiedEmployer = dashboardNav?.setIsVerifiedEmployer;
  const navSetOnOpenJobApplicants = dashboardNav?.setOnOpenJobApplicants;
  const navRequireAuth = dashboardNav?.requireAuth;
  const navSetAuthModalOpen = dashboardNav?.setAuthModalOpen;

  const setActiveTab = useCallback(
    (tab: DashboardTab) => {
      if (navSetActiveTab) {
        navSetActiveTab(tab);
        return;
      }
      setFallbackActiveTab(tab);
    },
    [navSetActiveTab]
  );
  const setMobileNavOpen = useCallback(
    (open: boolean) => {
      navSetMobileNavOpen?.(open);
    },
    [navSetMobileNavOpen]
  );
  const setNavAccountRole = useCallback(
    (role: string | null) => {
      navSetAccountRole?.(role);
    },
    [navSetAccountRole]
  );
  const setNavIsVerifiedEmployer = useCallback(
    (verified: boolean) => {
      navSetIsVerifiedEmployer?.(verified);
    },
    [navSetIsVerifiedEmployer]
  );

  const [showPublicProfile, setShowPublicProfile] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastVariant, setToastVariant] = useState<ToastVariant>("success");

  const [introModalCandidate, setIntroModalCandidate] =
    useState<TalentPoolCandidate | null>(null);
  const [introDefaultRoleTitle, setIntroDefaultRoleTitle] = useState("");
  const [applicantsDrawerJob, setApplicantsDrawerJob] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [focusApplicantsJobId, setFocusApplicantsJobId] = useState<string | null>(
    null
  );
  const [applicantsRefreshKey, setApplicantsRefreshKey] = useState(0);
  const [unlockedCandidateIds, setUnlockedCandidateIds] = useState<Set<string>>(
    new Set()
  );
  const [postJobModalOpen, setPostJobModalOpen] = useState(false);
  const [newJobTitle, setNewJobTitle] = useState("");
  const [newJobCompany, setNewJobCompany] = useState("");
  const [newJobLocation, setNewJobLocation] = useState("");
  const [newJobSalaryRange, setNewJobSalaryRange] = useState("");
  const [newJobRequiredSkills, setNewJobRequiredSkills] = useState("");
  const [newJobTechStack, setNewJobTechStack] = useState("");
  const [isCreatingJob, setIsCreatingJob] = useState(false);
  const [appOrigin, setAppOrigin] = useState("");

  // Profile data — client auth gate; middleware refreshes SSR cookies.
  const [user, setUser] = useState<User | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalError, setAuthModalError] = useState<string | null>(null);
  const [guestMobileNavOpen, setGuestMobileNavOpen] = useState(false);
  const requireAuth = useCallback(() => {
    if (user?.id) {
      return true;
    }
    if (navRequireAuth) {
      return navRequireAuth();
    }
    setAuthModalError(null);
    setAuthModalOpen(true);
    return false;
  }, [navRequireAuth, user?.id]);
  const [dbProfile, setDbProfile] = useState<ProfileRecord | null>(null);
  const [accountRole, setAccountRole] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [jobsError, setJobsError] = useState<string | null>(null);
  const [appliedJobIds, setAppliedJobIds] = useState<string[]>([]);
  const [jobInterestCounts, setJobInterestCounts] = useState<
    Record<string, number>
  >({});
  const [candidateIntroRequests, setCandidateIntroRequests] = useState<
    CandidateIntroRequestRow[]
  >([]);
  const [candidateIntroLoading, setCandidateIntroLoading] = useState(false);
  const [candidateIntroError, setCandidateIntroError] = useState<string | null>(
    null
  );
  const [introRespondLoadingId, setIntroRespondLoadingId] = useState<
    string | null
  >(null);
  const [talentMatchScores, setTalentMatchScores] = useState<
    Record<string, MatchResult>
  >({});
  const [talentMatchLoadingIds, setTalentMatchLoadingIds] = useState<
    Record<string, boolean>
  >({});
  const talentMatchFetchedRef = useRef<Set<string>>(new Set());
  const talentMatchInFlightRef = useRef<Set<string>>(new Set());
  const candidatesRef = useRef<TalentPoolCandidate[]>([]);
  const educationByProfileIdRef = useRef<Map<string, TalentPoolEducation>>(
    new Map()
  );
  const primaryMatchingJobRef = useRef<MatchingJob | null>(null);
  const talentSearchRef = useRef("");
  // Talent pool visibility — synced from profiles.is_visible_in_pool (visible to employers).
  const [isVisibleInPool, setIsVisibleInPool] = useState(false);
  const [isTogglingVisibility, setIsTogglingVisibility] = useState(false);

  // Prefer profiles.role, then auth user_metadata.role.
  const profileRole = accountRole ?? dbProfile?.role;
  const isBusinessAccount = isEmployerRole(profileRole);
  const isEmployeeAccount = isEmployeeRole(profileRole);
  const isVerifiedEmployer = dbProfile?.is_verified === true;
  const showTalentPoolNav = canAccessTalentPool(
    profileRole,
    isVerifiedEmployer
  );
  const [candidates, setCandidates] = useState<TalentPoolCandidate[]>([]);
  const [selectedCandidate, setSelectedCandidate] =
    useState<TalentPoolCandidate | null>(null);
  const [talentPoolLoading, setTalentPoolLoading] = useState(false);
  const [talentPoolError, setTalentPoolError] = useState<string | null>(null);
  const [talentPoolRefreshKey, setTalentPoolRefreshKey] = useState(0);
  const loadTalentPoolRef = useRef<TalentPoolLoadFn>(async () => {});

  useEffect(() => {
    setNavAccountRole(profileRole ?? null);
  }, [profileRole, setNavAccountRole]);

  useEffect(() => {
    setNavIsVerifiedEmployer(isVerifiedEmployer);
  }, [isVerifiedEmployer, setNavIsVerifiedEmployer]);

  useEffect(() => {
    const supabase = createClient();
    let isMounted = true;
    const timeoutId = window.setTimeout(() => {
      if (isMounted) {
        setAuthChecked(true);
        setLoadingProfile(false);
      }
    }, AUTH_BOOTSTRAP_TIMEOUT_MS);

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

        if (
          userError &&
          userError.name !== "AuthSessionMissingError" &&
          !/session missing/i.test(userError.message)
        ) {
          console.error("Dashboard session check failed:", userError.message, {
            code: userError.code,
          });
        }

        const sessionUser = authedUser ?? session?.user ?? null;

        if (!sessionUser) {
          setAuthChecked(true);
          setLoadingProfile(false);
          return;
        }

        setUser(sessionUser);

        const profileRow = await ensureUserProfile(supabase, sessionUser);

        if (!isMounted) return;

        const profile = profileRow ?? null;
        const resolvedRole = resolveAccountRole(profile?.role, sessionUser);
        let profileWithRole =
          profile && !profile.role && resolvedRole
            ? { ...profile, role: resolvedRole }
            : profile;

        const displayName = displayNameFromSources(profileWithRole, sessionUser);

        if (profileWithRole?.id && !profileWithRole.profile_slug?.trim()) {
          const profile_slug = buildUniqueProfileSlug(
            profileWithRole.full_name ?? displayName,
            profileWithRole.id
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

        const verifiedInDb = await employerIsVerifiedInDatabase(
          supabase,
          sessionUser.id
        );
        if (profileWithRole) {
          profileWithRole = {
            ...profileWithRole,
            is_verified: verifiedInDb,
          };
        }

        setDbProfile(profileWithRole);
        setAccountRole(resolvedRole);

        const loadedVisibleInPool = isVisibleToEmployers(
          profileWithRole?.is_visible_in_pool
        );
        const loadedPortfolioUrl = profileWithRole?.portfolio_url ?? "";
        setIsVisibleInPool(
          loadedVisibleInPool && isValidGitHubUrl(loadedPortfolioUrl)
        );

        const loadedName = displayName || "";
        const loadedTitle = profileWithRole?.job_title ?? "";
        const loadedBio = profileWithRole?.bio ?? "";
        const education = educationFromProfileRow(
          profileWithRole as unknown as Record<string, unknown>
        );
        const loadedSchool = education.university;
        const loadedDegree = education.major;
        const loadedSkills = Array.isArray(profileWithRole?.skills)
          ? profileWithRole.skills.join(", ")
          : "";
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
          name: loadedName,
          role: loadedTitle,
          bio: loadedBio,
          school: loadedSchool,
          degree: loadedDegree,
          gpa: formatGpa(education.gpa),
          gradYear: education.graduationYear || loadedGradYear,
          github: loadedPortfolioUrl,
          demoVideo: loadedYoutubeUrl,
          projects: profileWithRole?.key_accomplishments?.trim() || "",
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

        const hydratedBusiness = hydrateEmployerProfileFromRow(
          profileWithRole,
          sessionUser.email
        );
        setBusinessProfileData(hydratedBusiness);
        setSavedBusinessProfileData(hydratedBusiness);

        if (canAccessTalentPool(resolvedRole, profileWithRole?.is_verified === true)) {
          setProfileSubMenu("companyInfo");
          if (navSetDefaultTab) {
            navSetDefaultTab("talent");
          } else {
            setActiveTab("talent");
          }
        } else if (isEmployeeRole(resolvedRole)) {
          if (navSetDefaultTab) {
            navSetDefaultTab("opportunities");
          } else {
            setActiveTab("opportunities");
          }
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
          window.clearTimeout(timeoutId);
          setAuthChecked(true);
          setLoadingProfile(false);
        }
      }
    })();

    return () => {
      isMounted = false;
      window.clearTimeout(timeoutId);
    };
  }, [router]);

  useEffect(() => {
    if (authChecked && !user) {
      setActiveTab("opportunities");
    }
  }, [authChecked, user, setActiveTab]);

  useEffect(() => {
    if (user?.id) {
      setAuthModalOpen(false);
      setGuestMobileNavOpen(false);
    }
  }, [user?.id]);

  useEffect(() => {
    const supabase = createClient();
    let isMounted = true;

    const loadJobs = async () => {
      try {
        const { data, error } = await fetchDashboardJobs(supabase);

        if (!isMounted) return;

        if (error) {
          console.error("Supabase Jobs Error:", error);
          setJobs([]);
          setJobsError(error.message || "Could not load job feed.");
          return;
        }

        setJobs(data);
        setJobsError(null);
      } catch (err) {
        console.error("Supabase Jobs Error:", err);
        if (isMounted) {
          setJobs([]);
          setJobsError("Could not load job feed.");
        }
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

    const loadInterestCounts = async () => {
      try {
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
      } catch (err) {
        console.error("Failed to fetch job interest counts:", err);
      }
    };

    void loadInterestCounts();

    const channel = supabase
      .channel(`employer-job-interest-counts-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "job_applications" },
        () => {
          void loadInterestCounts();
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      void supabase.removeChannel(channel);
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
          applicants: jobInterestCounts[job.id] ?? 0,
          status: job.status === "paused" ? "Paused" : "Active",
        }))
    );
  }, [isBusinessAccount, user?.id, jobs, jobInterestCounts]);

  useEffect(() => {
    if (!showTalentPoolNav) {
      setCandidates([]);
      setTalentPoolLoading(false);
      setTalentPoolError(null);
      return;
    }

    const supabase = createClient();
    let isMounted = true;

    const loadTalentPool = async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) {
        setTalentPoolLoading(true);
      }

      try {
        const clientResult = await fetchEmployerTalentPoolProfiles(supabase);
        let data = clientResult.data;
        const error = clientResult.error;

        if (error || data.length === 0) {
          try {
            const response = await fetchWithAuth("/api/talent-pool");
            if (response.ok) {
              const payload = (await response.json()) as {
                profiles?: TalentPoolProfileRow[];
              };
              if (Array.isArray(payload.profiles) && payload.profiles.length > 0) {
                data = payload.profiles;
              }
            } else if (error) {
              console.error(
                "Talent pool API fallback failed:",
                response.status,
                await response.text()
              );
            }
          } catch (apiError) {
            console.error("Talent pool API fallback threw:", apiError);
          }
        }

        if (!isMounted) {
          return;
        }

        if (error && data.length === 0) {
          console.error("Talent pool fetch failed:", error);
          if (!opts?.silent) {
            setTalentPoolError("Could not load the talent pool. Please try again.");
          }
          return;
        }

        setTalentPoolError(null);

        const profileRows = data
          .filter(
            (row): row is TalentPoolProfileRow & { id: string } =>
              typeof row.id === "string" && row.id.length > 0
          )
          .map((row) => row as ProfileRecord & { id: string });

        const mapped = profileRows
          .filter(isProfileEligibleForTalentPool)
          .map(mapProfileRowToTalentCandidate)
          .map((candidate) =>
            applyCachedTalentEducation(
              candidate,
              educationByProfileIdRef.current
            )
          );

        setCandidates(mapped);
      } catch (err) {
        console.error("Talent pool fetch threw:", err);
        if (isMounted && !opts?.silent) {
          setTalentPoolError("Could not load the talent pool. Please try again.");
        }
      } finally {
        if (isMounted && !opts?.silent) {
          setTalentPoolLoading(false);
        }
      }
    };

    loadTalentPoolRef.current = loadTalentPool;
    void loadTalentPool();

    const shouldPoll = activeTab === "talent";
    const interval = shouldPoll
      ? window.setInterval(() => {
          void loadTalentPool({ silent: true });
        }, 4000)
      : null;

    const handleWindowFocus = () => {
      void loadTalentPool({ silent: true });
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void loadTalentPool({ silent: true });
      }
    };
    window.addEventListener("focus", handleWindowFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      isMounted = false;
      if (interval !== null) {
        window.clearInterval(interval);
      }
      window.removeEventListener("focus", handleWindowFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [showTalentPoolNav, activeTab, talentPoolRefreshKey]);

  useEffect(() => {
    if (!user?.id) {
      return;
    }

    const supabase = createClient();
    if (!showTalentPoolNav) {
      return ensureTalentPoolVisibilityChannel(supabase);
    }

    return subscribeTalentPoolVisibility(supabase, ({ profileId, visible }) => {
      if (!visible) {
        setCandidates((current) =>
          current.filter((candidate) => getTalentMatchId(candidate) !== profileId)
        );
        setSelectedCandidate((current) =>
          current && getTalentMatchId(current) === profileId ? null : current
        );
      }

      void loadTalentPoolRef.current({ silent: true });
    });
  }, [showTalentPoolNav, user?.id]);

  const fetchIntroUnlocks = useCallback(async (userId: string) => {
    const supabase = createClient();
    try {
      const { data, error } = await supabase
        .from("intro_requests")
        .select("candidate_id, status")
        .eq("user_id", userId);

      if (error) {
        console.error("Intro unlock fetch error:", error);
        return;
      }

      setUnlockedCandidateIds(collectUnlockedCandidateIds(data ?? []));
    } catch (err) {
      console.error("Intro unlock fetch threw:", err);
    }
  }, []);

  const fetchCandidateIntroRequests = useCallback(async (userId: string) => {
    const supabase = createClient();
    setCandidateIntroLoading(true);
    setCandidateIntroError(null);

    try {
      const columnSets: string[] = [
        CANDIDATE_INTRO_REQUEST_PUBLIC_COLUMNS,
        CANDIDATE_INTRO_REQUEST_PUBLIC_COLUMNS_FALLBACK,
      ];

      let loaded = false;
      for (const columns of columnSets) {
        const { data, error } = await supabase
          .from("intro_requests")
          .select(columns as "*")
          .eq("candidate_id", userId)
          .order("created_at", { ascending: false })
          .returns<CandidateIntroRequestRow[]>();

        if (!error) {
          setCandidateIntroRequests(data ?? []);
          loaded = true;
          break;
        }

        if (!isSupabaseSchemaError(error)) {
          console.error("Candidate intro request fetch error:", error);
          setCandidateIntroError(
            "Could not load intro requests. Please try again."
          );
          return;
        }
      }

      if (!loaded) {
        setCandidateIntroError("Could not load intro requests. Please try again.");
      }
    } catch (err) {
      console.error("Candidate intro request fetch threw:", err);
      setCandidateIntroError("Could not load intro requests. Please try again.");
    } finally {
      setCandidateIntroLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user?.id || !showTalentPoolNav) {
      return;
    }

    void fetchIntroUnlocks(user.id);

    const shouldPoll = activeTab === "talent";
    const interval = shouldPoll
      ? window.setInterval(() => {
          void fetchIntroUnlocks(user.id);
        }, 4000)
      : null;

    const refreshUnlocks = () => {
      void fetchIntroUnlocks(user.id);
    };

    window.addEventListener("focus", refreshUnlocks);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        refreshUnlocks();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      if (interval !== null) {
        window.clearInterval(interval);
      }
      window.removeEventListener("focus", refreshUnlocks);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [user?.id, showTalentPoolNav, activeTab, fetchIntroUnlocks]);

  useEffect(() => {
    if (!user?.id || isBusinessAccount || isEmployeeAccount) {
      return;
    }

    void fetchCandidateIntroRequests(user.id);
  }, [user?.id, isBusinessAccount, isEmployeeAccount, fetchCandidateIntroRequests]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const verifiedParam = params.get("employer_verified");
    const clearVerificationQuery = () => {
      const nextParams = new URLSearchParams(window.location.search);
      nextParams.delete("employer_verified");
      nextParams.delete("verify_error");
      const next = `${window.location.pathname}${
        nextParams.toString() ? `?${nextParams}` : ""
      }`;
      window.history.replaceState({}, "", next);
    };

    if (verifiedParam === "1") {
      if (!user?.id) {
        return;
      }

      let cancelled = false;
      const supabase = createClient();

      void (async () => {
        let verified = await employerIsVerifiedInDatabase(supabase, user.id);
        for (let attempt = 0; !verified && attempt < 4; attempt += 1) {
          await new Promise((resolve) => window.setTimeout(resolve, 400));
          if (cancelled) {
            return;
          }
          verified = await employerIsVerifiedInDatabase(supabase, user.id);
        }

        if (cancelled) {
          return;
        }

        if (verified) {
          setNavIsVerifiedEmployer(true);
          setDbProfile((prev) =>
            prev ? { ...prev, is_verified: true } : prev
          );
          setToastMessage(
            "Work email confirmed. Employer hiring tools are unlocked."
          );
          setToastVariant("success");
        } else {
          setToastMessage(
            "Could not confirm your work email. Request a new link from Get Verified."
          );
          setToastVariant("error");
        }

        window.setTimeout(() => setToastMessage(null), 4000);
        clearVerificationQuery();
      })();

      return () => {
        cancelled = true;
      };
    }

    if (verifiedParam === "0") {
      const reason = params.get("verify_error");
      setToastMessage(
        reason === "invalid" || reason === "missing_token"
          ? "That confirmation link is invalid or expired. Request a new one from Get Verified."
          : "Could not confirm your work email. Request a new link from Get Verified."
      );
      setToastVariant("error");
      window.setTimeout(() => setToastMessage(null), 4000);
      clearVerificationQuery();
    }

    const tab = dashboardTabFromSearchParam(params.get("tab"));
    if (
      (tab === "intro_requests" || activeTab === "intro_requests") &&
      !isBusinessAccount &&
      !isEmployeeAccount
    ) {
      if (!authChecked) {
        return;
      }
      if (!user) {
        if (navSetAuthModalOpen) {
          navSetAuthModalOpen(true);
        } else {
          setAuthModalOpen(true);
        }
        setActiveTab("opportunities");
      }
    }
  }, [
    authChecked,
    activeTab,
    navSetAuthModalOpen,
    setNavIsVerifiedEmployer,
    isBusinessAccount,
    isEmployeeAccount,
    setActiveTab,
    user,
  ]);

  useEffect(() => {
    if (!user || !authChecked) {
      return;
    }

    if (
      !showTalentPoolNav &&
      (activeTab === "talent" ||
        activeTab === "evaluator" ||
        activeTab === "auditor")
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
    if (!isBusinessAccount && activeTab === "applicants") {
      setActiveTab("my_profile");
    }
    if (
      (isBusinessAccount || isEmployeeAccount) &&
      activeTab === "intro_requests"
    ) {
      setActiveTab("my_profile");
    }
  }, [showTalentPoolNav, isEmployeeAccount, isBusinessAccount, activeTab, user, authChecked, setActiveTab]);

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

const showToast = (msg: string, variant?: ToastVariant) => {
  setToastMessage(msg);
  setToastVariant(variant ?? inferToastVariant(msg));
  setTimeout(() => setToastMessage(null), 3000);
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
  const [profileData, setProfileData] = useState(EMPTY_PROFILE_DATA);
  const [savedProfileData, setSavedProfileData] = useState(EMPTY_PROFILE_DATA);

  // Mirrors profileData/savedProfileData above, but for business accounts —
  // business name, industry, work email, and phone instead of dev credentials.
  const [businessProfileData, setBusinessProfileData] = useState(EMPTY_BUSINESS_PROFILE_DATA);
  const [savedBusinessProfileData, setSavedBusinessProfileData] = useState(EMPTY_BUSINESS_PROFILE_DATA);
  const employerCompanyNameForMatching =
    businessProfileData?.businessName?.trim() ||
    dbProfile?.company_name?.trim() ||
    "your company";

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
      tags: jobDisplayTags(selectedJob),
      tech_stack: parseJobListInput(selectedJob.tech_stack),
      required_skills: parseJobListInput(selectedJob.required_skills),
      location: selectedJob.location ?? "",
      description: selectedJob.description ?? "",
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
  const githubValidationMessage = getGitHubUrlValidationMessage(portfolioUrl);
  const isGitHubUrlValid = isValidGitHubUrl(portfolioUrl);
  const githubBlocksSave = !isBusinessAccount && !isGitHubUrlValid;
  const canSaveProfile = hasUnsavedChanges && !githubBlocksSave && !isSaving;
  const saveButtonLabel = isSaving
    ? "Saving..."
    : githubBlocksSave
      ? "Add GitHub URL to save"
      : hasUnsavedChanges
        ? "Save Changes"
        : "No Unsaved Changes";

  const handleVisibilityToggle = async () => {
    if (isTogglingVisibility) return;

    const nextVisible = !isVisibleInPool;
    if (nextVisible && !isValidGitHubUrl(portfolioUrl)) {
      showToast(
        getGitHubUrlValidationMessage(portfolioUrl) ??
          "Add a valid GitHub profile URL before joining the talent pool."
      );
      return;
    }

    const profileId = dbProfile?.id ?? user?.id;
    if (!profileId) {
      showToast("You must be logged in to update visibility.");
      return;
    }

    const previousVisible = isVisibleInPool;
    setIsVisibleInPool(nextVisible);
    setIsTogglingVisibility(true);

    try {
      const supabase = createClient();
      const { error, userMessage } = await persistCandidatePoolVisibility(
        supabase,
        profileId,
        nextVisible
      );

      if (error) {
        setIsVisibleInPool(previousVisible);
        showToast(
          userMessage ?? "Could not update talent pool visibility. Please try again."
        );
        return;
      }

      setDbProfile((prev) =>
        prev
          ? {
              ...prev,
              is_visible_in_pool: nextVisible,
              visible_to_employers: nextVisible,
            }
          : prev
      );
      setSavedCandidateProfile((prev) =>
        prev ? { ...prev, visibleInPool: nextVisible } : prev
      );
      void publishTalentPoolVisibility(supabase, {
        profileId,
        visible: nextVisible,
      });
      showToast(
        nextVisible
          ? "You are now visible to employers."
          : "You are hidden from the talent pool."
      );
    } catch (error) {
      console.error("Talent pool visibility update failed:", error);
      setIsVisibleInPool(previousVisible);
      showToast("Could not update talent pool visibility. Please try again.");
    } finally {
      setIsTogglingVisibility(false);
    }
  };

  const handleSaveProfile = async () => {
    if (isSaving || !hasUnsavedChanges) return;
    if (!isBusinessAccount && !isGitHubUrlValid) {
      showToast(
        githubValidationMessage ?? "GitHub profile URL is required."
      );
      return;
    }

    if (isBusinessAccount) {
      const profileId = dbProfile?.id ?? user?.id;
      if (!profileId) {
        showToast("You must be logged in to save your profile.");
        return;
      }

      const workEmailError = getCorporateWorkEmailValidationMessage(
        businessProfileData.workEmail
      );
      if (workEmailError) {
        showToast(workEmailError);
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
          showToast("You must be logged in to save your profile.");
          return;
        }

        const { error, isVerified } = await persistEmployerProfile(
          supabase,
          session.user.id,
          {
            businessName: businessProfileData.businessName,
            industry: businessProfileData.industry,
            companyBio: businessProfileData.companyBio,
            workEmail: businessProfileData.workEmail,
            phone: businessProfileData.phone,
          }
        );

        if (error) {
          console.error("Employer profile update failed:", error);
          showToast("Could not save company profile. Please try again.");
          return;
        }

        setDbProfile((prev) =>
          prev
            ? {
                ...prev,
                company_name: businessProfileData.businessName.trim() || null,
                industry: businessProfileData.industry.trim() || null,
                bio: businessProfileData.companyBio.trim() || null,
                contact_email: businessProfileData.workEmail.trim() || null,
                email: businessProfileData.workEmail.trim() || null,
                phone: businessProfileData.phone.trim() || null,
                is_verified: isVerified,
              }
            : prev
        );
        setSavedBusinessProfileData(businessProfileData);
        showToast(
          isVerified
            ? "Profile changes saved successfully!"
            : "Profile saved. Confirm your work email from Get Verified to unlock hiring tools."
        );
      } catch (error) {
        console.error("Employer profile update failed:", error);
        showToast("Could not save company profile. Please try again.");
      } finally {
        setIsSaving(false);
      }
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
      const normalizedPortfolioUrl = normalizeGitHubUrl(portfolioUrl);
      const effectiveVisibleInPool =
        isVisibleInPool && isValidGitHubUrl(normalizedPortfolioUrl);
      if (isVisibleInPool && !effectiveVisibleInPool) {
        setIsVisibleInPool(false);
      }
      const payload = buildCandidateProfileUpdatePayload(
        {
          fullName: profileData.name,
          jobTitle: title,
          bio,
          university: school,
          major: academicMajor,
          degree: academicMajor,
          skills: skillsArray,
          portfolioUrl: normalizedPortfolioUrl,
          youtubeUrl: dbProfile?.youtube_url ?? "",
          experienceLevel,
          availabilityStatus: normalizedAvailability,
          workPreference,
          candidateTimezone,
          isVisibleInPool: effectiveVisibleInPool,
          gradYear: profileData.gradYear,
          gpa: formatGpa(profileData.gpa),
          keyAccomplishments: profileData.projects,
        },
        session.user.id,
        { existingProfileSlug: dbProfile?.profile_slug }
      );

      const { data, error, userMessage } = await persistCandidateProfile(
        supabase,
        session.user.id,
        payload
      );

      if (error) {
        console.error("Profile update failed:", error);
        showToast(userMessage ?? "Could not save profile. Please try again.");
        return;
      }

      if (data) {
        setDbProfile((prev) =>
          prev
            ? {
                ...prev,
                ...(data as ProfileRecord),
                is_visible_in_pool: effectiveVisibleInPool,
                availability_status: normalizedAvailability,
                portfolio_url: normalizedPortfolioUrl,
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
        portfolioUrl: normalizedPortfolioUrl,
        experienceLevel,
        availabilityStatus: normalizedAvailability,
        workPreference,
        candidateTimezone,
        visibleInPool: effectiveVisibleInPool,
        gradYear: profileData.gradYear,
        gpa: formatGpa(profileData.gpa),
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
        github: normalizedPortfolioUrl,
        gpa: formatGpa(profileData.gpa),
      });
      setProfileData((current) => ({
        ...current,
        gpa: formatGpa(current.gpa),
      }));
      setPortfolioUrl(normalizedPortfolioUrl);
      setAvailabilityStatus(normalizedAvailability);
      setIsVisibleInPool(effectiveVisibleInPool);
      void publishTalentPoolVisibility(supabase, {
        profileId: session.user.id,
        visible: effectiveVisibleInPool,
      });
      showToast("Profile saved successfully.");
    } catch (error) {
      console.error("Profile update failed:", error);
      showToast("Could not save profile. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  // --- EMPLOYER JOB LISTINGS STATE (Business accounts only) ---
  const [businessListings, setBusinessListings] = useState<
    Array<{
      id: string;
      title: string;
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

  const [deletingListingId, setDeletingListingId] = useState<string | null>(
    null
  );

  const deleteListing = async (listing: {
    id: string;
    title: string;
  }) => {
    if (deletingListingId) {
      return;
    }

    const confirmed = window.confirm(
      `Delete "${listing.title}"? This cannot be undone.`
    );
    if (!confirmed) {
      return;
    }

    const previousListings = businessListings;
    const previousJobs = jobs;
    const previousDrawerJob = applicantsDrawerJob;

    setDeletingListingId(listing.id);
    setBusinessListings((prev) => prev.filter((entry) => entry.id !== listing.id));
    setJobs((prev) => prev.filter((job) => job.id !== listing.id));
    if (applicantsDrawerJob?.id === listing.id) {
      setApplicantsDrawerJob(null);
    }
    if (focusApplicantsJobId === listing.id) {
      setFocusApplicantsJobId(null);
    }

    try {
      const response = await fetch(`/api/jobs/${listing.id}`, {
        method: "DELETE",
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Could not delete listing.");
      }

      showToast("Listing deleted.");
    } catch (error) {
      console.error("Job delete failed:", error);
      setBusinessListings(previousListings);
      setJobs(previousJobs);
      setApplicantsDrawerJob(previousDrawerJob);
      showToast("Could not delete listing. Please try again.");
    } finally {
      setDeletingListingId(null);
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
  const [employerAuditResult, setEmployerAuditResult] =
    useState<AuditResult | null>(null);
  const [employerAuditError, setEmployerAuditError] = useState<string | null>(
    null
  );

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
  const [talentSearch, setTalentSearch] = useState("");
  const [experienceFilter, setExperienceFilter] = useState("all");
  const [roleTypeFilter, setRoleTypeFilter] = useState("all");
  const [availabilityFilter, setAvailabilityFilter] = useState("all");

  useEffect(() => {
    if (!selectedCandidate || !showTalentPoolNav) {
      return;
    }

    const profileId = resolveTalentProfileId(selectedCandidate);
    if (!profileId) {
      console.warn(
        "[talent-pool/education] skipped fetch: candidate has no profiles.id UUID",
        { id: selectedCandidate.id, profileId: selectedCandidate.profileId }
      );
      return;
    }

    let cancelled = false;

    void (async () => {
      const supabase = createClient();
      const emptyEducation: TalentPoolEducation = {
        university: "",
        major: "",
        gpa: "",
        graduationYear: "",
      };

      const [clientEducation, apiEducation] = await Promise.all([
        fetchCandidateEducationForEmployer(supabase, profileId),
        (async () => {
          try {
            const response = await fetchWithAuth(
              `/api/talent-pool/education?profileId=${encodeURIComponent(profileId)}`
            );
            if (!response.ok) {
              console.error(
                "[talent-pool/education] API status",
                response.status,
                await response.text()
              );
              return null;
            }
            const payload = (await response.json()) as Record<string, unknown>;
            return educationFromProfileRow(payload);
          } catch (error) {
            console.error("Talent pool education API failed:", error);
            return null;
          }
        })(),
      ]);

      if (cancelled) {
        return;
      }

      const education = mergeTalentEducation(
        clientEducation ?? emptyEducation,
        apiEducation ?? emptyEducation
      );

      if (!hasTalentEducation(education)) {
        console.warn("[talent-pool/education] empty payload for", profileId);
        return;
      }

      educationByProfileIdRef.current.set(profileId, education);

      const applyEducation = (candidate: TalentPoolCandidate) => {
        if (resolveTalentProfileId(candidate) !== profileId) {
          return candidate;
        }

        return {
          ...candidate,
          ...mergeTalentEducation(candidateEducationFields(candidate), education),
        };
      };

      setSelectedCandidate((current) =>
        current ? applyEducation(current) : current
      );
      setCandidates((current) => current.map(applyEducation));
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedCandidate?.profileId, selectedCandidate?.id, showTalentPoolNav]);

  useEffect(() => {
    if (!selectedCandidate || !user?.id || !showTalentPoolNav) {
      return;
    }

    void fetchIntroUnlocks(user.id);
  }, [
    selectedCandidate?.profileId,
    selectedCandidate?.id,
    user?.id,
    showTalentPoolNav,
    fetchIntroUnlocks,
  ]);

  candidatesRef.current = candidates;
  primaryMatchingJobRef.current = primaryMatchingJob;
  talentSearchRef.current = talentSearch;

  const talentCandidateIdsKey = useMemo(
    () =>
      candidates
        .map((candidate) => getTalentMatchId(candidate))
        .sort()
        .join("|"),
    [candidates]
  );

  const scoredCandidates = useMemo(() => {
    const jobPayload = buildTalentMatchJobPayload(
      primaryMatchingJob,
      talentSearch
    );

    return candidates.map((candidate) => {
      const heuristic = scoreTalentMatch(
        {
          title: candidate.role,
          bio: candidate.bio,
          skills: candidate.skills,
          degree: candidate.major,
        },
        jobPayload
      );
      const matchId = getTalentMatchId(candidate);
      const live =
        talentMatchScores[matchId] ?? talentMatchScores[candidate.id];
      const isLoading = Boolean(
        talentMatchLoadingIds[matchId] ?? talentMatchLoadingIds[candidate.id]
      );
      const liveScore =
        live && !isCannedMatchScore(live.match_percentage)
          ? live.match_percentage
          : null;
      const matchPending = Boolean(user?.id) && (isLoading || live == null);

      return {
        ...candidate,
        matchScore: liveScore ?? heuristic.match_percentage,
        matchPending,
      };
    });
  }, [
    candidates,
    primaryMatchingJob,
    talentSearch,
    talentMatchScores,
    talentMatchLoadingIds,
    user?.id,
  ]);

  const filteredCandidates = scoredCandidates.filter((candidate) => {
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
    if (!requireAuth()) {
      return;
    }

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

  const getMatchBadgeClass = (insight: MatchInsight) =>
    getFitVerdictBadgeClass(insight.fit_verdict);

  const candidateSkillsForMatching = useMemo(() => {
    if (Array.isArray(dbProfile?.skills) && dbProfile.skills.length > 0) {
      return dbProfile.skills;
    }

    return (skills ?? "")
      .split(",")
      .map((skill) => skill.trim())
      .filter(Boolean);
  }, [dbProfile?.skills, skills]);

  const matchCandidate = useMemo(
    () => ({
      skills: candidateSkillsForMatching,
      experienceTier: dbProfile?.experience_level?.trim() || experienceLevel,
      githubUrl: portfolioUrl.trim() || dbProfile?.portfolio_url?.trim() || "",
      githubAudit: null,
    }),
    [
      candidateSkillsForMatching,
      dbProfile?.experience_level,
      dbProfile?.portfolio_url,
      experienceLevel,
      portfolioUrl,
    ]
  );

  const {
    matchInsights,
    matchLoadingIds,
    aiMatchRunning,
    aiMatchError,
    runAiMatch,
  } = useProvixAiMatch({
    jobs,
    userId: user?.id ?? null,
    authLoading: !authChecked,
    requireAuth,
    candidate: matchCandidate,
  });

  const activeJobs = useMemo(() => getActiveJobs(jobs), [jobs]);

  const activeOpeningsCount = useMemo(
    () => countActiveOpenings(jobs),
    [jobs]
  );

  const profileVisibleToEmployers =
    isVisibleToEmployers(dbProfile?.is_visible_in_pool) &&
    isValidGitHubUrl(portfolioUrl);

  const filteredRadarJobFeed = activeJobs.filter((job) => {
    const query = radarSearch.trim().toLowerCase();
    const tags = jobDisplayTags(job);
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
    return insight?.fit_verdict === "Strong Fit";
  }).length;

  useEffect(() => {
    talentMatchFetchedRef.current.clear();
    talentMatchInFlightRef.current.clear();
    setTalentMatchScores({});
    setTalentMatchLoadingIds({});
  }, [primaryMatchingJob?.id]);

  useEffect(() => {
    if (activeTab !== "talent" || !showTalentPoolNav || !user?.id) {
      return;
    }

    const currentCandidates = candidatesRef.current;
    if (currentCandidates.length === 0) {
      return;
    }

    const requestJobId = primaryMatchingJob?.id ?? null;
    const jobIdForStorage =
      requestJobId && isUuid(requestJobId) ? requestJobId : null;
    const userId = user.id;
    let cancelled = false;

    const isCurrentJob = () =>
      (primaryMatchingJobRef.current?.id ?? null) === requestJobId;

    void (async () => {
      const supabase = createClient();

      const cachedByCandidate = await loadCachedTalentMatchScores(
        supabase,
        userId,
        jobIdForStorage
      );

      if (cancelled || !isCurrentJob()) {
        return;
      }

      const trustedCache: Record<string, MatchResult> = {};
      for (const candidate of currentCandidates) {
        const matchId = getTalentMatchId(candidate);
        const insight =
          cachedByCandidate[matchId] ?? cachedByCandidate[candidate.id];
        if (!insight || isLegacyCannedMatchScore(insight.match_percentage)) {
          continue;
        }
        trustedCache[matchId] = insight;
        talentMatchFetchedRef.current.add(
          buildTalentMatchKey(matchId, jobIdForStorage)
        );
      }

      if (Object.keys(trustedCache).length > 0) {
        setTalentMatchScores((prev) => ({ ...prev, ...trustedCache }));
        setTalentMatchLoadingIds((prev) => {
          const next = { ...prev };
          for (const candidateId of Object.keys(trustedCache)) {
            next[candidateId] = false;
          }
          return next;
        });
      }

      const pendingCandidates = currentCandidates.filter((candidate) => {
        const matchId = getTalentMatchId(candidate);
        const key = buildTalentMatchKey(matchId, jobIdForStorage);
        return (
          !talentMatchFetchedRef.current.has(key) &&
          !talentMatchInFlightRef.current.has(key)
        );
      });

      if (pendingCandidates.length === 0) {
        return;
      }

      for (const candidate of pendingCandidates) {
        talentMatchInFlightRef.current.add(
          buildTalentMatchKey(getTalentMatchId(candidate), jobIdForStorage)
        );
      }

      setTalentMatchLoadingIds((prev) => {
        const next = { ...prev };
        for (const candidate of pendingCandidates) {
          next[getTalentMatchId(candidate)] = true;
        }
        return next;
      });

      await Promise.all(
        pendingCandidates.map(async (candidate) => {
          const matchId = getTalentMatchId(candidate);
          const key = buildTalentMatchKey(matchId, jobIdForStorage);
          const candidatePayload = {
            title: candidate.role,
            bio: candidate.bio ?? "",
            skills: candidate.skills,
            degree: candidate.major,
          };
          const jobPayload = buildTalentMatchJobPayload(
            primaryMatchingJobRef.current,
            talentSearchRef.current
          );

          try {
            const data = await fetchTalentMatchInsight(
              candidatePayload,
              jobPayload
            );
            const insight = isCannedMatchScore(data.match_percentage)
              ? scoreTalentMatch(candidatePayload, jobPayload)
              : data;

            if (isCurrentJob()) {
              talentMatchFetchedRef.current.add(key);
              setTalentMatchScores((prev) => ({
                ...prev,
                [matchId]: insight,
              }));
            }

            await saveTalentMatchScore(supabase, {
              employerId: userId,
              candidateId: matchId,
              jobId: jobIdForStorage,
              insight,
            });
          } catch (err) {
            console.warn(
              `Failed to fetch talent match for ${matchId}:`,
              err
            );

            if (isCurrentJob()) {
              const fallback = buildFallbackMatch(
                candidatePayload,
                jobPayload
              );
              talentMatchFetchedRef.current.add(key);
              setTalentMatchScores((prev) => ({
                ...prev,
                [matchId]: fallback,
              }));
            }
          } finally {
            talentMatchInFlightRef.current.delete(key);
            if (isCurrentJob()) {
              setTalentMatchLoadingIds((prev) => ({
                ...prev,
                [matchId]: false,
              }));
            }
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
    primaryMatchingJob?.id,
    talentCandidateIdsKey,
  ]);

  const handleExpressInterestToJob = async (job: (typeof jobs)[number]) => {
    if (!requireAuth() || !user?.id) {
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
    showToast("Interest sent. The employer will review your profile.");

    try {
      const result = await submitCandidateJobInterest(job.id);
      if (result.alreadyApplied) {
        return;
      }
    } catch (err) {
      console.error("Failed to submit job interest:", err);
      setAppliedJobIds((prev) => prev.filter((id) => id !== job.id));
      setAppliedJobs((prev) =>
        prev.filter((application) => application.jobId !== job.id)
      );
      showToast("Could not submit interest. Please try again.");
    }
  };

  const handleExpressInterest = (job: (typeof jobs)[number]) => {
    void handleExpressInterestToJob(job);
  };

  const savedProfilesCount = 8;
  const scoredTalentMatches = scoredCandidates.filter(
    (candidate) => candidate.matchScore >= 80
  ).length;
  const newMatchesCount =
    scoredTalentMatches > 0
      ? scoredTalentMatches
      : scoredCandidates.filter(
          (candidate) => candidate.availability === "Available Now"
        ).length;

  const openIntroModal = (candidate: TalentPoolCandidate) => {
    if (!requireAuth()) {
      return;
    }
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
      window.setTimeout(() => {
        setFocusApplicantsJobId(jobId);
        setApplicantsDrawerJob(null);
        setActiveTab("applicants");
        if (window.location.pathname !== "/dashboard") {
          router.push("/dashboard");
        }
      }, 0);
    },
    [router, setActiveTab]
  );
  const openApplicantsDrawerForJobRef = useRef(openApplicantsDrawerForJob);
  openApplicantsDrawerForJobRef.current = openApplicantsDrawerForJob;

  useEffect(() => {
    if (!navSetOnOpenJobApplicants) {
      return;
    }

    const handler = (jobId: string) => {
      openApplicantsDrawerForJobRef.current(jobId);
    };
    navSetOnOpenJobApplicants(handler);
    return () => navSetOnOpenJobApplicants(null);
  }, [navSetOnOpenJobApplicants]);

  const handleApplicantIntroRequest = (
    applicant: JobApplicantView | EmployerApplicantView
  ) => {
    const roleTitle =
      "jobTitle" in applicant
        ? applicant.jobTitle
        : applicantsDrawerJob?.title ?? applicant.headline;
    const introCandidate = mapApplicantToTalentCandidate(applicant);

    setApplicantsDrawerJob(null);
    setIntroDefaultRoleTitle(roleTitle);
    setIntroModalCandidate(introCandidate);
  };

  const handleIntroRequestSuccess = () => {
    if (user?.id) {
      void fetchIntroUnlocks(user.id);
    }
    setApplicantsRefreshKey((current) => current + 1);

    showToast(
      "Intro request submitted. The candidate will be notified to accept or decline."
    );
  };

  const handleCandidateIntroResponse = async (
    introId: string,
    action: "accept" | "decline"
  ) => {
    const nextStatus = action === "accept" ? "accepted" : "declined";
    const previousRequests = candidateIntroRequests;

    setIntroRespondLoadingId(introId);
    setCandidateIntroRequests((prev) =>
      prev.map((request) =>
        request.id === introId ? { ...request, status: nextStatus } : request
      )
    );

    try {
      const response = await fetch(`/api/intros/${introId}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const payload = (await response.json()) as {
        success?: boolean;
        message?: string;
        error?: string;
        status?: string;
      };

      if (!response.ok || !payload.success) {
        setCandidateIntroRequests(previousRequests);
        showToast(payload.error ?? "Could not update intro request.");
        return;
      }

      if (user?.id) {
        void fetchCandidateIntroRequests(user.id);
      }

      showToast(
        payload.message ??
          (action === "accept"
            ? "Intro accepted. Check your inbox for the mutual introduction email."
            : "Intro request declined.")
      );
    } catch (error) {
      console.error("Candidate intro response failed:", error);
      setCandidateIntroRequests(previousRequests);
      showToast("Could not update intro request.");
    } finally {
      setIntroRespondLoadingId(null);
    }
  };

  const handleCandidateIntroDismiss = async (
    introId: string,
    dismissed: boolean
  ) => {
    const previousRequests = candidateIntroRequests;
    const dismissedAt = dismissed ? new Date().toISOString() : null;

    setIntroRespondLoadingId(introId);
    setCandidateIntroRequests((prev) =>
      prev.map((request) =>
        request.id === introId
          ? {
              ...request,
              candidate_dismissed_at: dismissedAt,
              status:
                dismissed &&
                normalizeCandidateIntroStatus(request.status) === "pending"
                  ? "dismissed"
                  : !dismissed &&
                      normalizeCandidateIntroStatus(request.status) ===
                        "dismissed"
                    ? "pending"
                    : request.status,
            }
          : request
      )
    );

    try {
      const response = await fetch(`/api/intros/${introId}/dismiss`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dismissed }),
      });
      const payload = (await response.json()) as {
        success?: boolean;
        message?: string;
        error?: string;
      };

      if (!response.ok || !payload.success) {
        setCandidateIntroRequests(previousRequests);
        showToast(payload.error ?? "Could not update intro request.");
        return;
      }

      if (user?.id) {
        void fetchCandidateIntroRequests(user.id);
      }

      showToast(
        payload.message ??
          (dismissed
            ? "Intro request moved to dismissed."
            : "Intro request restored to your inbox.")
      );
    } catch (error) {
      console.error("Candidate intro dismiss failed:", error);
      setCandidateIntroRequests(previousRequests);
      showToast("Could not update intro request.");
    } finally {
      setIntroRespondLoadingId(null);
    }
  };

  const getCandidatePublicName = (candidate: TalentPoolCandidate) =>
    buildAlliterativeAliasIdentity(candidate.profileId?.trim() || "").alias;

  const getCandidatePublicInitials = (candidate: TalentPoolCandidate) =>
    getPublicCandidateInitials({
      codenameAlias: getCandidatePublicName(candidate),
      candidateId: candidate.profileId ?? candidate.id,
    });

  const isCandidateUnlocked = (candidate: TalentPoolCandidate) =>
    isIntroUnlockedForCandidate(candidate, unlockedCandidateIds);

  const intelligenceDrawerCandidate = selectedCandidate
    ? applyCachedTalentEducation(
        (() => {
          const current = selectedCandidate;
          const scoredCandidate =
            scoredCandidates.find(
              (candidate) =>
                resolveTalentProfileId(candidate) ===
                resolveTalentProfileId(current)
            ) ?? current;
          return {
            ...scoredCandidate,
            ...mergeTalentEducation(
              candidateEducationFields(scoredCandidate),
              candidateEducationFields(current)
            ),
          };
        })(),
        educationByProfileIdRef.current
      )
    : null;

  // Simulators
  const runEssayAudit = async () => {
    if (!requireAuth()) {
      return;
    }

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
    if (!requireAuth()) {
      return;
    }

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
    if (!requireAuth()) {
      return;
    }

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

  const evaluateCandidate = async () => {
    if (!requireAuth()) {
      return;
    }

    if (!evalAccomplishments.trim()) {
      return;
    }

    setEvaluatingPoW(true);
    setEmployerAuditError(null);
    setEmployerAuditResult(null);

    try {
      const response = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetRole: evalRole.trim() || undefined,
          resumeSummary: evalAccomplishments.trim(),
          compensationLevel: evalMajor.trim() || undefined,
        }),
      });

      const data = (await response.json()) as AuditResult & { error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? `Audit failed (${response.status})`);
      }

      setEmployerAuditResult(data);
    } catch (error) {
      console.error("Employer audit failed:", error);
      setEmployerAuditError(
        error instanceof Error
          ? error.message
          : "Could not run candidate audit. Please try again."
      );
    } finally {
      setEvaluatingPoW(false);
    }
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
  const candidateVerifiedOnProvix = isVerifiedOnProvix({
    full_name: profileData.name,
    name: profileData.name,
    job_title: title,
    headline: title,
    bio,
    skills,
    experience_level: experienceLevel,
    university: school,
    school,
    major: degree,
    degree,
    availability_status: availabilityStatus,
    work_preference: workPreference,
    timezone: candidateTimezone,
    portfolio_url: portfolioUrl || dbProfile?.portfolio_url,
    integrity_score: dbProfile?.integrity_score,
    audit_data: dbProfile?.audit_data,
  });

  // --- DERIVED VALUES FOR THE SHAREABLE BUSINESS PROFILE CARD ---
  const businessInitials =
    businessProfileData?.businessName
      ?.split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "??";
  const activeRolesCount = businessListings.filter((listing) => listing.status === "Active").length;
  const savedCompanyName =
    businessProfileData?.businessName?.trim() ||
    dbProfile?.company_name?.trim() ||
    "";
  const employerCompanyName = savedCompanyName || "your company";

  const resetNewJobForm = () => {
    setNewJobTitle("");
    setNewJobLocation("");
    setNewJobSalaryRange("");
    setNewJobRequiredSkills("");
    setNewJobTechStack("");
    setNewJobCompany(employerCompanyName);
  };

  const openPostJobModal = () => {
    if (!isVerifiedEmployer) {
      showToast(
        "Confirm your work email from Get Verified to unlock job posting."
      );
      setProfileSubMenu("companyInfo");
      setActiveTab("my_profile");
      return;
    }
    setNewJobCompany(employerCompanyName);
    setPostJobModalOpen(true);
  };

  const handleCreateJob = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user?.id || isCreatingJob) return;

    if (!isVerifiedEmployer) {
      showToast(
        "Confirm your work email from Get Verified before posting jobs."
      );
      return;
    }

    if (!newJobTitle.trim()) {
      showToast("Job title is required.");
      return;
    }
    if (!newJobCompany.trim()) {
      showToast("Company name is required.");
      return;
    }
    if (!newJobLocation.trim()) {
      showToast("Location is required.");
      return;
    }
    if (!newJobSalaryRange.trim()) {
      showToast("Salary range is required.");
      return;
    }
    const requiredSkills = parseJobListInput(newJobRequiredSkills);
    const techStack = parseJobListInput(newJobTechStack);

    if (requiredSkills.length === 0) {
      showToast("Add at least one required skill.");
      return;
    }

    setIsCreatingJob(true);
    const supabase = createClient();

    const displayTags = jobDisplayTags({
      tech_stack: techStack,
      required_skills: requiredSkills,
    });

    const jobPayload = {
      title: newJobTitle.trim(),
      company: newJobCompany.trim(),
      location: newJobLocation.trim(),
      salary_range: formatSalaryRange(newJobSalaryRange.trim()),
      tags: displayTags,
      tech_stack: techStack.length > 0 ? techStack : null,
      required_skills: requiredSkills,
      employer_id: user.id,
    };

    try {
      let { data, error } = await supabase
        .from("jobs")
        .insert(jobPayload)
        .select("*")
        .single();

      if (error && isMissingColumnError(error)) {
        const fallback = await supabase
          .from("jobs")
          .insert({
            title: jobPayload.title,
            company: jobPayload.company,
            location: jobPayload.location,
            salary_range: jobPayload.salary_range,
            tags: jobPayload.tags,
            employer_id: jobPayload.employer_id,
          })
          .select("*")
          .single();
        data = fallback.data;
        error = fallback.error;
      }

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
    } catch (err) {
      console.error("Create job error:", err);
      showToast("Could not post job. Please try again.");
    } finally {
      setIsCreatingJob(false);
    }
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

  const renderProfileFormActions = (options?: { showShareLink?: boolean }) => (
    <div className="mt-6 pt-6 border-t border-zinc-800 space-y-3">
      <div className="flex flex-col sm:flex-row gap-3">
        <button
          type="button"
          onClick={handleSaveProfile}
          disabled={!canSaveProfile}
          className={`w-full sm:flex-1 font-bold py-3 rounded-xl text-xs transition-all flex items-center justify-center gap-2 ${
            canSaveProfile
              ? "bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer"
              : "bg-slate-800 text-slate-500 cursor-not-allowed"
          }`}
        >
          {isSaving ? null : hasUnsavedChanges && !githubBlocksSave ? (
            <Icons.Save />
          ) : (
            <Icons.Check />
          )}
          {saveButtonLabel}
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
      {githubBlocksSave && (
        <p className="text-[11px] text-rose-400">
          {githubValidationMessage ??
            "A valid GitHub profile URL is required on the Proof of Work tab before profile changes can be saved."}
        </p>
      )}
    </div>
  );

  const handleGuestNavClick = () => {
    setGuestMobileNavOpen(false);
    requireAuth();
  };

  const guestNavClass = (active: boolean) =>
    `order-none w-full text-left px-3 py-2 rounded-lg border font-medium transition-colors duration-200 ease-out flex items-center gap-3 text-[13px] cursor-pointer ${
      active
        ? "bg-slate-800/60 text-white border-transparent"
        : "text-zinc-400 border-transparent hover:bg-zinc-800/50 hover:text-white"
    }`;

  const renderGuestNav = () => (
    <div>
      <div className="mt-8 pt-8 border-t border-zinc-800">
        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-3 px-2">
          Candidate Dashboard
        </span>
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          <li className="order-none w-full shrink-0">
            <button
              type="button"
              onClick={() => handleGuestNavClick()}
              className={guestNavClass(false)}
            >
              <Icons.User />
              My Profile
            </button>
          </li>
          <li className="order-none w-full shrink-0">
            <Link
              href="/opportunities"
              onClick={() => setGuestMobileNavOpen(false)}
              className={guestNavClass(false)}
            >
              <Icons.Compass />
              Opportunities
            </Link>
          </li>
          <li className="order-none w-full shrink-0">
            <button
              type="button"
              onClick={() => handleGuestNavClick()}
              className={guestNavClass(false)}
            >
              <Icons.Mail />
              Intro Requests
            </button>
          </li>
        </ul>
      </div>
      <div className="mt-8 pt-8 border-t border-zinc-800">
        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-3 px-2">
          Career Accelerator
        </span>
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          <li className="order-none w-full shrink-0">
            <button
              type="button"
              onClick={() => handleGuestNavClick()}
              className={guestNavClass(false)}
            >
              <FileText className="w-4 h-4 shrink-0" aria-hidden="true" />
              Pitch Studio
            </button>
          </li>
          <li className="order-none w-full shrink-0">
            <Link
              href="/audits"
              onClick={() => setGuestMobileNavOpen(false)}
              className={guestNavClass(false)}
            >
              <ShieldCheck className="w-4 h-4 shrink-0" aria-hidden="true" />
              Code & Resume Auditor
            </Link>
          </li>
          <li className="order-none w-full shrink-0">
            <button
              type="button"
              onClick={() => handleGuestNavClick()}
              className={guestNavClass(false)}
            >
              <Target className="w-4 h-4 shrink-0" aria-hidden="true" />
              Interview Simulator
            </button>
          </li>
        </ul>
      </div>
    </div>
  );

  const isStandaloneGuest = Boolean(!user && !dashboardNav);
  const isLoading =
    loadingProfile ||
    ((activeTab === "opportunities" || activeTab === "opportunity_radar") &&
      jobsLoading);

  return (
    <>
      <div
        className={
          isStandaloneGuest
            ? "flex h-screen overflow-hidden bg-[#0A0A0A] text-slate-200 font-sans antialiased"
            : undefined
        }
      >
        {isStandaloneGuest ? (
          <aside className="hidden md:flex w-64 h-screen sticky top-0 shrink-0 flex-col bg-[#111111] border-r border-zinc-800 z-20 overflow-y-auto">
            <div className="p-6 flex flex-col min-h-full">
              <Link
                href="/"
                className="block mb-8 hover:opacity-90 transition-opacity"
              >
                <ProvixLogo />
              </Link>
              <div className="flex-1">{renderGuestNav()}</div>
              <button
                type="button"
                onClick={() => requireAuth()}
                className="mt-8 w-full bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold tracking-tight px-4 py-2.5 rounded-md transition-colors duration-200 ease-out cursor-pointer"
              >
                Sign In
              </button>
            </div>
          </aside>
        ) : null}
        <div
          className={
            isStandaloneGuest
              ? "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
              : undefined
          }
        >
          {isStandaloneGuest ? (
            <MobileAppHeader
              onOpenMenu={() => setGuestMobileNavOpen(true)}
              onSignIn={() => requireAuth()}
              isGuest
            />
          ) : null}
          {isStandaloneGuest ? (
            <div className="md:hidden">
              <button
                type="button"
                aria-label="Close navigation menu"
                aria-hidden={!guestMobileNavOpen}
                tabIndex={guestMobileNavOpen ? 0 : -1}
                onClick={() => setGuestMobileNavOpen(false)}
                className={`fixed inset-0 z-40 cursor-pointer bg-black/60 transition-opacity duration-300 ease-in-out motion-reduce:transition-none ${
                  guestMobileNavOpen
                    ? "opacity-100"
                    : "pointer-events-none opacity-0"
                }`}
              />
              <aside
                aria-hidden={!guestMobileNavOpen}
                inert={!guestMobileNavOpen}
                className={`fixed inset-y-0 left-0 z-50 w-64 max-w-[85vw] overflow-y-auto border-r border-zinc-800 bg-[#111111] p-6 transition-transform duration-300 ease-in-out motion-reduce:transition-none ${
                  guestMobileNavOpen
                    ? "translate-x-0"
                    : "pointer-events-none -translate-x-full"
                }`}
              >
                {renderGuestNav()}
              </aside>
            </div>
          ) : null}
          <div
            className={
              dashboardNav
                ? undefined
                : isStandaloneGuest
                  ? "flex-1 overflow-x-hidden overflow-y-auto p-4 pt-8 sm:p-6 sm:pt-10 md:p-12"
                  : "min-h-screen bg-[#0A0A0A] text-slate-200 p-4 pt-8 sm:p-6 sm:pt-10 md:p-12"
            }
          >
      {!isBusinessAccount && !isEmployeeAccount && activeTab === "intro_requests" ? (
        <div className="w-full max-w-5xl mx-auto animate-fadeIn">
          <CandidateIntroRequestsPanel
            requests={candidateIntroRequests}
            loading={candidateIntroLoading}
            error={candidateIntroError}
            respondingId={introRespondLoadingId}
            onRetry={() => {
              if (user?.id) {
                void fetchCandidateIntroRequests(user.id);
              }
            }}
            onDismiss={handleCandidateIntroDismiss}
            onRespond={handleCandidateIntroResponse}
          />
        </div>
      ) : isLoading ? (
        <DashboardSkeleton />
      ) : (
        <>
      {isEmployeeAccount && activeTab === "opportunity_radar" && (
        <div
          className={`mb-6 inline-flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-md border border-zinc-800 bg-[#111111] ${
            isVisibleInPool ? "text-zinc-300" : "text-zinc-500"
          }`}
        >
          {isVisibleInPool
            ? "Open to work — visible to employers"
            : "Profile hidden from employers"}
        </div>
      )}
      <div
        key={activeTab}
        className="w-full max-w-5xl mx-auto space-y-10 animate-fadeIn"
      >

          {/* MY PROFILE TAB WITH NESTED MENU OPTIONS */}
          {activeTab === "my_profile" && (
            <div className="max-w-3xl">
              <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-3xl font-extrabold tracking-tight text-white">
                      Profile Studio
                    </h1>
                    {!isBusinessAccount ? (
                      <VerifiedOnProvixPill verified={candidateVerifiedOnProvix} />
                    ) : null}
                  </div>
                  <p className="text-zinc-300 text-sm mt-2 max-w-2xl leading-relaxed">
                    {isBusinessAccount
                      ? "Manage your company profile, hiring requirements, and account settings."
                      : candidateVerifiedOnProvix
                        ? "Your profile is complete and a GitHub integrity audit has run successfully."
                        : "Complete every required field and run a GitHub integrity audit to earn Verified on Provix."}
                  </p>
                </div>
                {!isBusinessAccount && (
                  <ShareProfileButton profileSlug={profileSlug} />
                )}
              </div>

              {/* HORIZONTAL SUB-MENU BAR */}
              <div className="flex border-b border-zinc-800 mb-8 space-x-6">
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
              <div className="card-edge bg-[#111111] rounded-2xl border border-zinc-800 p-8 shadow-2xl">
                {profileSubMenu === "companyInfo" && (
                  <div className="space-y-6">
                    <div className="flex items-center gap-5 pb-6 border-b border-zinc-800">
                      <div className="w-16 h-16 rounded-2xl bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-xl font-bold text-indigo-400">
                        {businessProfileData?.businessName?.trim()?.charAt(0) || "?"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-2xl text-white truncate">
                          {businessProfileData.businessName.trim() || "Company name"}
                        </p>
                        <p className="text-xs text-indigo-400 font-medium mt-1 truncate">
                          {businessProfileData.industry.trim() || "Industry"}
                        </p>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-400 mb-2 uppercase">
                        Company Name
                      </label>
                      <input
                        type="text"
                        value={businessProfileData.businessName}
                        onChange={(e) =>
                          setBusinessProfileData({
                            ...businessProfileData,
                            businessName: e.target.value,
                          })
                        }
                        placeholder="Acme Inc."
                        className="w-full bg-[#0A0A0A] border border-zinc-800 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-indigo-500"
                      />
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
                          placeholder="you@company.com"
                          className="w-full bg-[#0A0A0A] border border-zinc-800 rounded-xl p-3 text-sm text-white font-mono focus:outline-none focus:border-indigo-500"
                        />
                        <p className="mt-1.5 text-[11px] text-zinc-500">
                          Corporate domain required. Use Get Verified to confirm this inbox — saving the profile does not unlock hiring tools.
                        </p>
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
                          className="w-full bg-[#0A0A0A] border border-zinc-800 rounded-xl p-3 text-sm text-white font-mono focus:outline-none focus:border-indigo-500"
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
                        className="w-full bg-[#0A0A0A] border border-zinc-800 rounded-xl p-3 text-sm text-white font-mono focus:outline-none focus:border-indigo-500"
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
                        className="w-full bg-[#0A0A0A] border border-zinc-800 rounded-xl p-3.5 text-sm text-white focus:outline-none focus:border-indigo-500 resize-none leading-relaxed"
                      />
                    </div>

                    {renderProfileFormActions({ showShareLink: true })}
                  </div>
                )}

                {profileSubMenu === "activeListings" && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-bold text-white">
                        Active Job Listings
                      </h3>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setFocusApplicantsJobId(null);
                            setActiveTab("applicants");
                          }}
                          className="text-[11px] font-bold text-indigo-400 hover:text-indigo-300 px-2 py-2 transition-colors cursor-pointer"
                        >
                          View applicants
                        </button>
                        <button
                          type="button"
                          onClick={openPostJobModal}
                          className="bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold px-3.5 py-2 rounded-lg transition-all cursor-pointer"
                        >
                          + Post New Job
                        </button>
                      </div>
                    </div>

                    {businessListings.length === 0 ? (
                      <div className="rounded-xl border border-zinc-800 bg-slate-900/30 p-6 text-center">
                        <p className="text-sm text-slate-400">
                          No active listings yet. Post a job to start receiving
                          candidate interest.
                        </p>
                      </div>
                    ) : (
                      businessListings.map((listing) => (
                      <div
                        key={listing.id}
                        className="flex items-center justify-between p-4 bg-slate-900/50 border border-zinc-800 rounded-xl"
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
                        <div className="flex items-center gap-2 shrink-0">
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
                        <button
                          type="button"
                          aria-label={`Delete ${listing.title}`}
                          title="Delete listing"
                          onClick={() => void deleteListing(listing)}
                          disabled={deletingListingId === listing.id}
                          className="p-1.5 rounded-lg border border-zinc-800 text-slate-400 hover:text-red-300 hover:border-red-500/30 hover:bg-red-500/10 transition-colors cursor-pointer disabled:opacity-60"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                        </div>
                      </div>
                    ))
                    )}
                  </div>
                )}

                {profileSubMenu === "overview" && (
                  <div className="space-y-6">
                    <div className="flex items-center gap-5 pb-6 border-b border-zinc-800">
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
                          <div className="flex-1 min-w-0">
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
                            <VerifiedOnProvixPill
                              verified={candidateVerifiedOnProvix}
                              className="mt-2"
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
                        className="w-full bg-[#0A0A0A] border border-zinc-800 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-indigo-500"
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
                        className="w-full bg-[#0A0A0A] border border-zinc-800 rounded-xl p-3.5 text-sm text-white focus:outline-none focus:border-indigo-500 resize-none leading-relaxed"
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
                        className="w-full bg-[#0A0A0A] border border-zinc-800 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-indigo-500"
                      />
                      <p className="text-[11px] text-slate-500 mt-2">
                        Comma-separated skills used for job matching.
                      </p>
                    </div>

                    <div>
                      <div className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider mb-2">
                        Academic Snapshot
                      </div>
                      <div className="bg-[#0A0A0A] border border-zinc-800 rounded-xl p-3.5 text-xs text-slate-200 space-y-2">
                        {school ? (
                          <div className="flex items-start justify-between gap-3">
                            <span className="text-slate-500 shrink-0">University</span>
                            <span className="text-right">{school}</span>
                          </div>
                        ) : null}
                        {degree ? (
                          <div className="flex items-start justify-between gap-3">
                            <span className="text-slate-500 shrink-0">Major</span>
                            <span className="text-right">{degree}</span>
                          </div>
                        ) : null}
                        {formatGpa(profileData.gpa) ? (
                          <div className="flex items-start justify-between gap-3">
                            <span className="text-slate-500 shrink-0">GPA</span>
                            <span className="text-right font-mono">
                              {formatGpa(profileData.gpa)}
                            </span>
                          </div>
                        ) : null}
                        {profileData.gradYear ? (
                          <div className="flex items-start justify-between gap-3">
                            <span className="text-slate-500 shrink-0">Graduation</span>
                            <span className="text-right">
                              Class of {profileData.gradYear}
                            </span>
                          </div>
                        ) : null}
                        {!school &&
                        !degree &&
                        !formatGpa(profileData.gpa) &&
                        !profileData.gradYear ? (
                          <p className="text-slate-500">
                            Education details not provided. Add them in Academics
                            & Major.
                          </p>
                        ) : null}
                      </div>
                    </div>

                    {renderProfileFormActions()}
                  </div>
                )}

                {profileSubMenu === "academics" && (
                  <div className="space-y-6">
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
                          className="w-full bg-[#0A0A0A] border border-zinc-800 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-indigo-500"
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
                            className="w-full bg-[#0A0A0A] border border-zinc-800 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-indigo-500"
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
                          inputMode="decimal"
                          placeholder="3.8"
                          value={profileData.gpa}
                          onChange={(e) => {
                            const next = e.target.value;
                            if (!isGpaDraft(next)) {
                              return;
                            }
                            setProfileData({
                              ...profileData,
                              gpa: next,
                            });
                          }}
                          onBlur={() => {
                            setProfileData({
                              ...profileData,
                              gpa: formatGpa(profileData.gpa),
                            });
                          }}
                          className="w-full bg-[#0A0A0A] border border-zinc-800 rounded-xl p-3 text-sm text-white font-mono focus:outline-none focus:border-indigo-500"
                        />
                        <p className="mt-1.5 text-[10px] text-slate-500">
                          4.0 scale only (for example 4.0 or 3.8).
                        </p>
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
                            className="w-full bg-[#0A0A0A] border border-zinc-800 rounded-xl p-3 text-sm text-white font-mono focus:outline-none focus:border-indigo-500"
                          />
                        )}
                      </div>
                    </div>

                    {renderProfileFormActions()}
                  </div>
                )}

                {profileSubMenu === "portfolio" && (
                  <div className="space-y-6">
                    <h3 className="text-sm font-bold text-white mb-2">
                      Verifiable Projects & Links
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-400 mb-2 uppercase">
                          GitHub Profile URL{" "}
                          <span className="text-rose-400">*</span>
                        </label>
                        <input
                          type="url"
                          required
                          value={portfolioUrl}
                          onChange={(e) => setPortfolioUrl(e.target.value)}
                          aria-invalid={Boolean(githubValidationMessage)}
                          placeholder="https://github.com/your-handle"
                          className={`w-full bg-[#0A0A0A] border rounded-xl p-3 text-sm text-white font-mono focus:outline-none ${
                            githubValidationMessage
                              ? "border-rose-500/70 focus:border-rose-500"
                              : "border-zinc-800 focus:border-indigo-500"
                          }`}
                        />
                        {githubValidationMessage && (
                          <p className="mt-2 text-[11px] text-rose-400">
                            {githubValidationMessage}
                          </p>
                        )}
                        <p className="mt-2 text-[11px] text-slate-500">
                          Required to save your profile and appear in the employer talent pool.
                          If your GitHub is private or empty, add project artifacts below so the
                          AI auditor can still verify your work.
                        </p>
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-400 mb-2 uppercase">
                          Resume
                        </label>
                        {loadingProfile ? (
                          <div className="h-24 w-full rounded-xl bg-slate-800 animate-pulse" />
                        ) : (
                          <ResumeFileUpload
                            persistToProfile
                            initialFilename={dbProfile?.resume_filename ?? null}
                            helperText="Parsed on upload so the Code & Resume Auditor can cross-check claims against your repos or saved project artifacts."
                            onPersisted={(meta) => {
                              setDbProfile((prev) =>
                                prev
                                  ? {
                                      ...prev,
                                      resume_filename: meta.filename,
                                      resume_uploaded_at: meta.uploadedAt,
                                    }
                                  : prev
                              );
                              showToast(
                                meta.hasResume
                                  ? "Resume parsed and saved for AI audits."
                                  : "Resume removed from your profile."
                              );
                            }}
                          />
                        )}
                      </div>
                    </div>

                    <ExternalProjectsForm />

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
                        className="w-full bg-[#0A0A0A] border border-zinc-800 rounded-xl p-3.5 text-sm text-white focus:outline-none focus:border-indigo-500 resize-none leading-relaxed"
                      />
                    </div>

                    {renderProfileFormActions()}
                  </div>
                )}

                {profileSubMenu === "settings" && (
                  <div className="space-y-6">
                    {!isBusinessAccount && (
                      <>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="p-4 bg-slate-900/50 border border-zinc-800 rounded-xl space-y-3">
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
                              className="w-full bg-[#0A0A0A] border border-zinc-800 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-indigo-500"
                            >
                              {WORK_PREFERENCE_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="p-4 bg-slate-900/50 border border-zinc-800 rounded-xl space-y-3">
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
                              className="w-full bg-[#0A0A0A] border border-zinc-800 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-indigo-500"
                            >
                              {TIMEZONE_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div className="p-4 bg-slate-900/50 border border-zinc-800 rounded-xl space-y-3">
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
                            className="w-full bg-[#0A0A0A] border border-zinc-800 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-indigo-500"
                          >
                            {AVAILABILITY_STATUS_OPTIONS.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="flex items-center justify-between gap-4 p-4 bg-slate-900/50 border border-zinc-800 rounded-xl">
                          <div>
                            <span className="font-bold text-xs text-white block">
                              Visible to Employers
                            </span>
                            <span className="text-[11px] text-slate-500">
                              Off by default. Turn this on to opt in to the talent
                              pool. Requires a valid GitHub profile URL.
                            </span>
                          </div>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={isVisibleInPool}
                            aria-label="Visible to Employers"
                            disabled={isTogglingVisibility}
                            onClick={() => {
                              void handleVisibilityToggle();
                            }}
                            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                              isTogglingVisibility
                                ? "opacity-60 cursor-wait"
                                : "cursor-pointer"
                            } ${
                              isVisibleInPool ? "bg-emerald-500" : "bg-zinc-700"
                            }`}
                          >
                            <span
                              aria-hidden="true"
                              className="pointer-events-none absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200"
                              style={{
                                transform: isVisibleInPool
                                  ? "translateX(1.25rem)"
                                  : "translateX(0)",
                              }}
                            />
                          </button>
                        </div>

                        {renderProfileFormActions()}
                      </>
                    )}

                    <div
                      className={`flex items-center justify-between gap-4 ${
                        isBusinessAccount ? "" : "pt-2"
                      }`}
                    >
                      <div>
                        <span className="font-bold text-xs text-white block">
                          Sign out of Provix
                        </span>
                        <span className="text-[11px] text-slate-500">
                          You'll be returned to the login screen on this device.
                        </span>
                        <span className="mt-2 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                          {user?.email
                            ? `Signed in as ${user.email}`
                            : "Signed in"}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={handleSignOut}
                        className="bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20 text-xs font-bold px-4 py-2.5 rounded-xl transition-all flex items-center gap-2 cursor-pointer shrink-0"
                      >
                        <Icons.Logout /> Sign Out
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* CANDIDATE / EMPLOYEE: OPPORTUNITIES JOB FEED */}
          {!isBusinessAccount && activeTab === "opportunities" && (
            <OpportunitiesJobFeed
              jobs={jobs}
              jobsLoading={jobsLoading}
              jobsError={jobsError}
              isGuest={!user}
              appliedJobIds={appliedJobIds}
              onExpressInterest={handleExpressInterestToJob}
              matchInsights={matchInsights}
              matchLoadingIds={matchLoadingIds}
              candidateSkills={candidateSkillsForMatching}
              profileVisibleToEmployers={profileVisibleToEmployers}
              loadingProfile={loadingProfile}
              enableAiMatch
              aiMatchRunning={aiMatchRunning}
              aiMatchError={aiMatchError}
              onRunAiMatch={runAiMatch}
            />
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
                <p className="text-zinc-300 text-sm mt-2">
                  AI-driven structural analysis and line-by-line feedback for your Common App essays.
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
                {/* Left: inputs */}
                <div className="lg:col-span-7 card-edge bg-[#111111] rounded-2xl border border-zinc-800 p-5 sm:p-6 shadow-lg space-y-4">
                  <div>
                    <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest block mb-2">
                      Target School
                    </label>
                    <input
                      type="text"
                      value={essayTargetSchool}
                      onChange={(e) => setEssayTargetSchool(e.target.value)}
                      placeholder="e.g. Stanford University"
                      className="w-full bg-[#0A0A0A] border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-all"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest block mb-2">
                      College Prompt
                    </label>
                    <textarea
                      rows={3}
                      value={essayPrompt}
                      onChange={(e) => setEssayPrompt(e.target.value)}
                      placeholder="Paste the essay prompt you're responding to..."
                      className="w-full bg-[#0A0A0A] border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 resize-none transition-all"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">
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
                      className="w-full bg-[#0A0A0A] border border-zinc-800 rounded-xl px-4 py-4 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 resize-none transition-all"
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
                          : "bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer"
                    }`}
                  >
                    {evaluatingEssay ? (
                      <>
                        <span className="relative flex h-2 w-2">
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
                <div className="lg:col-span-5 card-edge bg-[#111111] rounded-2xl border border-zinc-800 p-5 sm:p-6 shadow-lg">
                  {evaluatingEssay ? (
                    <div className="flex flex-col items-center justify-center min-h-[320px] text-center">
                      <div className="relative mb-4">
                        <div className="w-16 h-16 rounded-full border-2 border-indigo-500/30 flex items-center justify-center animate-pulse">
                          <Icons.Pen />
                        </div>
                        <span className="absolute -top-1 -right-1 flex h-3 w-3">
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
                          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-1">
                            Overall Score
                          </span>
                          <p className="text-sm text-slate-300 leading-relaxed">
                            {essayReview.verdict}
                          </p>
                        </div>
                        <div
                          className={`shrink-0 w-14 h-14 rounded-lg flex items-center justify-center text-xl font-mono font-extrabold tabular-nums border ${
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
                          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-3">
                            Actionable Suggestions
                          </span>
                          <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                            {essayReview.lineFeedback.map((item, index) => (
                              <div
                                key={`${item.originalText}-${index}`}
                                className="rounded-xl bg-[#0A0A0A] border border-zinc-800 p-3"
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
                <p className="text-zinc-300 text-sm mt-2">
                  Assess your case strength, build an evidence checklist, and draft a professional aid appeal letter.
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
                {/* Left: inputs */}
                <div className="lg:col-span-5 card-edge bg-[#111111] rounded-2xl border border-zinc-800 p-5 sm:p-6 shadow-lg space-y-4">
                  <div>
                    <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest block mb-2">
                      College Name
                    </label>
                    <input
                      type="text"
                      value={collegeName}
                      onChange={(e) => setCollegeName(e.target.value)}
                      placeholder="e.g. NYU, Stanford University"
                      className="w-full bg-[#0A0A0A] border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-all"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest block mb-2">
                      Current Aid Offer (Optional)
                    </label>
                    <input
                      type="text"
                      value={currentOffer}
                      onChange={(e) => setCurrentOffer(e.target.value)}
                      placeholder="e.g. $12,000 grant + $5,500 loans"
                      className="w-full bg-[#0A0A0A] border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-all"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest block mb-2">
                      Appeal Reason
                    </label>
                    <select
                      value={appealReason}
                      onChange={(e) => setAppealReason(e.target.value)}
                      className="w-full bg-[#0A0A0A] border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-all cursor-pointer"
                    >
                      <option value="Competing Offer">Competing Offer</option>
                      <option value="Financial Hardship">Financial Hardship</option>
                      <option value="Merit-Based Review">Merit-Based Review</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest block mb-2">
                      Detailed Notes
                    </label>
                    <textarea
                      rows={8}
                      value={contextDetails}
                      onChange={(e) => setContextDetails(e.target.value)}
                      placeholder="Describe changed circumstances, competing offers, family income updates, or merit achievements..."
                      className="w-full bg-[#0A0A0A] border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 resize-none transition-all"
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
                          : "bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer"
                    }`}
                  >
                    {generatingAid ? (
                      <>
                        <span className="relative flex h-2 w-2">
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
                    <div className="card-edge bg-[#111111] rounded-2xl border border-zinc-800 p-10 shadow-lg flex flex-col items-center justify-center min-h-[420px] text-center">
                      <div className="relative mb-4">
                        <div className="w-16 h-16 rounded-full border-2 border-indigo-500/30 flex items-center justify-center animate-pulse">
                          <FileText className="w-7 h-7 text-indigo-400" aria-hidden="true" />
                        </div>
                        <span className="absolute -top-1 -right-1 flex h-3 w-3">
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

                      <div className="card-edge bg-[#111111] rounded-2xl border border-zinc-800 p-5 sm:p-6 shadow-lg">
                        <div className="flex items-center justify-between gap-3 mb-4">
                          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
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
                          <div className="mt-5 pt-5 border-t border-zinc-800">
                            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-3">
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

                      <div className="card-edge bg-[#111111] rounded-2xl border border-zinc-800 p-5 sm:p-6 shadow-lg">
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-3">
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

                      <div className="card-edge bg-[#111111] rounded-2xl border border-zinc-800 p-5 sm:p-6 shadow-lg">
                        <div className="flex items-center justify-between gap-3 mb-4">
                          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                            Formal Letter Drafter
                          </span>
                          <button
                            type="button"
                            onClick={copyAppealLetter}
                            className={`text-[11px] font-bold px-3 py-1.5 rounded-lg border transition-all flex items-center gap-1.5 cursor-pointer ${
                              letterCopied
                                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                : "bg-[#0A0A0A] text-slate-400 border-zinc-800 hover:text-slate-200 hover:border-slate-700"
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
                        <div className="rounded-xl bg-[#0A0A0A] border border-zinc-800 p-4 text-[13px] text-slate-300 leading-relaxed whitespace-pre-wrap">
                          {aidAppealResult.letterBody}
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="card-edge bg-[#111111] rounded-2xl border border-zinc-800 p-10 shadow-lg flex flex-col items-center justify-center min-h-[420px] text-center">
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
                <p className="text-zinc-300 text-sm mt-2">
                  Personalized reach, target, and safety school recommendations based on your profile.
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
                <div className="lg:col-span-4 card-edge bg-[#111111] rounded-2xl border border-zinc-800 p-5 sm:p-6 shadow-lg space-y-4">
                  <div>
                    <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest block mb-2">
                      GPA
                    </label>
                    <input
                      type="text"
                      value={fitGpa}
                      onChange={(e) => setFitGpa(e.target.value)}
                      placeholder="e.g. 3.8"
                      className="w-full bg-[#0A0A0A] border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-all"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest block mb-2">
                      Intended Major
                    </label>
                    <input
                      type="text"
                      value={fitMajor}
                      onChange={(e) => setFitMajor(e.target.value)}
                      placeholder="e.g. Computer Science"
                      className="w-full bg-[#0A0A0A] border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-all"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest block mb-2">
                      Test Scores
                    </label>
                    <input
                      type="text"
                      value={fitTestScores}
                      onChange={(e) => setFitTestScores(e.target.value)}
                      placeholder="e.g. SAT 1450 / ACT 32"
                      className="w-full bg-[#0A0A0A] border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-all"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest block mb-2">
                      Location Preference
                    </label>
                    <input
                      type="text"
                      value={fitLocationPreference}
                      onChange={(e) => setFitLocationPreference(e.target.value)}
                      placeholder="e.g. West Coast, Northeast"
                      className="w-full bg-[#0A0A0A] border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-all"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest block mb-2">
                      Annual Budget Preference
                    </label>
                    <input
                      type="text"
                      value={fitBudgetPreference}
                      onChange={(e) => setFitBudgetPreference(e.target.value)}
                      placeholder="e.g. Under $30k net cost"
                      className="w-full bg-[#0A0A0A] border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-all"
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
                          : "bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer"
                    }`}
                  >
                    {generatingCollegeFit ? (
                      <>
                        <span className="relative flex h-2 w-2">
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
                    <div className="card-edge bg-[#111111] rounded-2xl border border-zinc-800 p-6 sm:p-8 shadow-lg space-y-5 min-h-[320px]">
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <div className="w-12 h-12 rounded-full border-2 border-indigo-500/30 flex items-center justify-center animate-pulse">
                            <Icons.GraduationCap />
                          </div>
                          <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
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
                                    : "border-zinc-800 bg-[#0A0A0A]"
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
                      <div className="card-edge bg-[#111111] rounded-2xl border border-zinc-800 p-5 sm:p-6 shadow-lg">
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-2">
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
                          className={`card-edge bg-[#111111] rounded-2xl border ${section.accent} p-5 sm:p-6 shadow-lg`}
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
                                  className="rounded-xl bg-[#0A0A0A] border border-zinc-800 p-4 sm:p-5"
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

                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-3 border-t border-zinc-800">
                                    <div className="rounded-lg border border-zinc-800 bg-[#111111] p-3">
                                      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block mb-1.5">
                                        Acceptance Odds
                                      </span>
                                      <p className="text-xs text-slate-300 leading-relaxed">
                                        {school.acceptanceOdds}
                                      </p>
                                    </div>
                                    <div className="rounded-lg border border-zinc-800 bg-[#111111] p-3">
                                      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block mb-1.5">
                                        Financial Profile
                                      </span>
                                      <p className="text-xs text-slate-300 leading-relaxed">
                                        {school.financialProfile}
                                      </p>
                                    </div>
                                    <div className="md:col-span-2 rounded-lg border border-zinc-800 bg-[#111111] p-3">
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
                                            className="text-xs text-zinc-300 leading-relaxed flex items-start gap-2"
                                          >
                                            <span className="mt-0.5 shrink-0 font-mono text-zinc-500">
                                              –
                                            </span>
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
                    <div className="card-edge bg-[#111111] rounded-2xl border border-zinc-800 p-10 shadow-lg flex flex-col items-center justify-center min-h-[320px] text-center">
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
                <p className="text-zinc-300 text-sm mt-2">
                  AI-matched roles from verified employers — tuned to your skills and visibility settings.
                </p>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
                <div className="card-edge bg-[#111111] p-5 rounded-2xl border border-zinc-800 shadow-lg">
                  <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest block mb-1">
                    Active Roles
                  </span>
                  <span className="text-3xl font-extrabold text-white">
                    {jobsLoading ? "—" : filteredRadarJobFeed.length}
                  </span>
                  <p className="text-[11px] text-slate-500 mt-1">
                    of {jobsLoading ? "—" : activeOpeningsCount} active
                  </p>
                </div>
                <div className="card-edge bg-[#111111] p-5 rounded-2xl border border-zinc-800 shadow-lg">
                  <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest block mb-1">
                    Direct Matches
                  </span>
                  <span className="text-3xl font-extrabold text-emerald-400">
                    {jobsLoading ? "—" : radarDirectMatchesCount}
                  </span>
                  <p className="text-[11px] text-slate-500 mt-1">90%+ fit score</p>
                </div>
                <div className="card-edge bg-[#111111] p-5 rounded-2xl border border-zinc-800 shadow-lg col-span-2 lg:col-span-1">
                  <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest block mb-1">
                    Profile Views
                  </span>
                  <span className="text-3xl font-extrabold text-indigo-400">
                    {profileViewsCount}
                  </span>
                  <p className="text-[11px] text-slate-500 mt-1">last 30 days</p>
                </div>
              </div>

              <div className="card-edge bg-[#111111] border border-zinc-800 rounded-2xl p-4 mb-6 shadow-lg">
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
                      className="w-full bg-[#0A0A0A] border border-zinc-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-all"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setRemoteOnly((prev) => !prev)}
                    className={`shrink-0 text-[11px] font-bold px-4 py-2.5 rounded-xl border transition-all cursor-pointer ${
                      remoteOnly
                        ? "bg-indigo-600 border-indigo-500 text-white"
                        : "bg-[#0A0A0A] border-zinc-800 text-slate-400 hover:text-slate-200 hover:border-slate-700"
                    }`}
                  >
                    Remote Only
                  </button>
                  <select
                    value={radarExperienceFilter}
                    onChange={(e) => setRadarExperienceFilter(e.target.value)}
                    className="shrink-0 bg-[#0A0A0A] border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-all cursor-pointer"
                  >
                    <option value="all">All Experience Levels</option>
                    <option value="Entry-Level">Entry-Level</option>
                    <option value="Mid-Level">Mid-Level</option>
                  </select>
                </div>
              </div>

              {jobsLoading ? (
                <div className="card-edge bg-[#111111] border border-zinc-800 rounded-2xl p-10 text-center">
                  <p className="text-sm font-medium text-slate-400">
                    Loading opportunities...
                  </p>
                </div>
              ) : jobsError ? (
                <div className="card-edge bg-[#111111] border border-zinc-800 rounded-2xl p-10 text-center">
                  <p className="text-sm font-medium text-slate-300">
                    Could not load job feed
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    The opportunities list is unavailable right now. You can
                    keep using the rest of the dashboard.
                  </p>
                </div>
              ) : activeJobs.length === 0 ? (
                <div className="card-edge bg-[#111111] border border-zinc-800 rounded-2xl p-10 text-center">
                  <p className="text-sm font-medium text-slate-300">
                    No active openings right now
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Check back soon — new roles are posted as employers join Provix.
                  </p>
                </div>
              ) : filteredRadarJobFeed.length === 0 ? (
                <div className="card-edge bg-[#111111] border border-zinc-800 rounded-2xl p-10 text-center">
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
                    const tags = jobDisplayTags(job);
                    const insight = matchInsights[job.id];
                    const isMatching = matchLoadingIds[job.id];
                    const matchScore = insight?.match_score ?? 0;
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
                        className="card-edge card-lift bg-[#111111] border border-zinc-800 rounded-2xl p-5 shadow-lg flex flex-col"
                      >
                        <div className="flex items-start justify-between gap-3 mb-4">
                          <div className="flex items-start gap-3 min-w-0">
                            <div className="w-11 h-11 rounded-lg bg-zinc-950 border border-zinc-800 flex items-center justify-center shrink-0">
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
                          <div className="flex flex-col items-end gap-1.5 shrink-0">
                            <span
                              className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold border ${
                                isMatching
                                  ? "bg-indigo-500/10 text-indigo-300 border-indigo-500/30 animate-pulse"
                                  : insight
                                    ? getMatchBadgeClass(insight)
                                    : "bg-slate-800/80 text-slate-500 border-slate-700/50"
                              }`}
                            >
                              {isMatching
                                ? "Scoring…"
                                : insight
                                  ? insight.fit_verdict
                                  : "Pending"}
                            </span>
                            {insight && !isMatching ? (
                              <>
                                <span className="text-[10px] font-mono font-bold tabular-nums text-zinc-400">
                                  {clampScore0to100(matchScore)}% match
                                </span>
                                <ScoreMeter
                                  score={matchScore}
                                  className="w-16"
                                />
                              </>
                            ) : null}
                          </div>
                        </div>

                        <p className="text-xs text-slate-500 mb-3">{job.location}</p>

                        <div className="mb-5">
                          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-2">
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
                          <div className="mb-5 rounded-xl bg-[#0A0A0A] border border-zinc-800 p-3">
                            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-2">
                              AI Match Analysis
                            </span>
                            {isMatching ? (
                              <div className="flex items-center gap-2">
                                <span className="relative flex h-2 w-2">
                                  <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500" />
                                </span>
                                <p className="text-xs text-slate-500">
                                  Evaluating your profile against this role with Gemini…
                                </p>
                              </div>
                            ) : (
                              <ul className="space-y-1.5">
                                {insight?.match_reasons.map((reason, index) => (
                                  <li
                                    key={`${job.id}-reason-${index}`}
                                    className="flex items-start gap-2 text-xs text-slate-300 leading-relaxed"
                                  >
                                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-indigo-400" />
                                    <span>{reason}</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        )}

                        <div className="mt-auto flex items-center justify-between gap-3 pt-4 border-t border-zinc-800">
                          <button
                            type="button"
                            onClick={() =>
                              handleSaveOpportunity(job.id, job.title ?? "Role")
                            }
                            className={`text-[11px] font-bold px-3 py-2 rounded-lg border transition-all cursor-pointer flex items-center gap-1.5 ${
                              isSaved
                                ? "bg-indigo-500/10 border-indigo-500/30 text-indigo-400"
                                : "bg-[#0A0A0A] border-zinc-800 text-slate-400 hover:text-slate-200 hover:border-slate-700"
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
                                : "bg-indigo-600 hover:bg-indigo-500 text-white"
                            }`}
                          >
                            {alreadyInterested ? (
                              <>
                                Interest Sent
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
                <p className="text-zinc-300 text-sm mt-2">
                  Track roles you&apos;ve applied to and their current status.
                </p>
              </div>

              {appliedJobs.length === 0 ? (
                <div className="card-edge bg-[#111111] border border-zinc-800 rounded-2xl p-10 text-center">
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
                      className="card-edge bg-[#111111] border border-zinc-800 rounded-2xl p-5 shadow-lg flex flex-col md:flex-row md:items-center md:justify-between gap-4"
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

          {/* EMPLOYER: INTERESTED CANDIDATES */}
          {isBusinessAccount && activeTab === "applicants" && (
            <EmployerApplicantsSection
              key={applicantsRefreshKey}
              userId={user?.id ?? null}
              focusJobId={focusApplicantsJobId}
              onClearFocusJob={() => setFocusApplicantsJobId(null)}
              onRequestIntro={handleApplicantIntroRequest}
              requireAuth={requireAuth}
              onToast={showToast}
              companyName={employerCompanyNameForMatching}
            />
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
                      ? savedCompanyName
                        ? `Welcome, ${savedCompanyName}`
                        : "Welcome"
                      : "Vetted Talent Pool"}
                  </h1>
                  <p className="text-zinc-300 text-sm mt-2">
                    {isBusinessAccount
                      ? "Your company profile is live. Search anonymized, AI-vetted talent below."
                      : "Hire top young talent based on verifiable projects and education."}
                  </p>
                </div>
                {isBusinessAccount && (
                  <button
                    type="button"
                    onClick={openPostJobModal}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-all cursor-pointer shrink-0"
                  >
                    + Post New Job
                  </button>
                )}
              </div>

              {/* METRICS ROW */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                <div className="card-edge bg-[#111111] p-5 rounded-2xl border border-zinc-800 shadow-lg">
                  <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest block mb-1">
                    Total Candidates
                  </span>
                  <span className="text-3xl font-mono font-extrabold tabular-nums text-white">
                    {candidates.length}
                  </span>
                </div>
                <div className="card-edge bg-[#111111] p-5 rounded-2xl border border-zinc-800 shadow-lg">
                  <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest block mb-1">
                    Saved Profiles
                  </span>
                  <span className="text-3xl font-mono font-extrabold tabular-nums text-white">
                    {savedProfilesCount}
                  </span>
                </div>
                <div className="card-edge bg-[#111111] p-5 rounded-2xl border border-zinc-800 shadow-lg">
                  <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest block mb-1">
                    New Matches
                  </span>
                  <span className="text-3xl font-mono font-extrabold tabular-nums text-indigo-400">
                    {newMatchesCount}
                  </span>
                </div>
                <div className="card-edge bg-[#111111] p-5 rounded-2xl border border-zinc-800 shadow-lg">
                  <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest block mb-1">
                    Active Roles
                  </span>
                  <span className="text-3xl font-mono font-extrabold tabular-nums text-emerald-400">
                    {activeRolesCount}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* FILTER SIDEBAR */}
                <aside className="lg:col-span-3 card-edge bg-[#111111] border border-zinc-800 rounded-2xl p-5 shadow-2xl space-y-5">
                  <div>
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-3">
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
                      className="w-full bg-[#0A0A0A] border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
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
                      className="w-full bg-[#0A0A0A] border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
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
                      className="w-full bg-[#0A0A0A] border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
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
                      className="w-full bg-[#111111] border border-zinc-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-all"
                    />
                  </div>

                  {talentPoolLoading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                      {Array.from({ length: 3 }).map((_, index) => (
                        <div
                          key={index}
                          className="card-edge bg-[#111111] border border-zinc-800 rounded-2xl p-5 animate-pulse min-h-[260px]"
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
                  ) : talentPoolError ? (
                    <div className="card-edge bg-[#111111] border border-red-500/20 rounded-2xl p-10 text-center">
                      <p className="text-sm font-medium text-red-200">
                        {talentPoolError}
                      </p>
                      <button
                        type="button"
                        onClick={() =>
                          setTalentPoolRefreshKey((current) => current + 1)
                        }
                        className="mt-4 bg-red-500/10 hover:bg-red-500/15 border border-red-500/25 text-red-200 font-semibold py-2 px-4 rounded-lg text-xs transition-all cursor-pointer"
                      >
                        Retry
                      </button>
                    </div>
                  ) : filteredCandidates.length === 0 ? (
                    <div className="card-edge bg-[#111111] border border-zinc-800 rounded-2xl p-10 text-center">
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
                            key={col.profileId}
                            className="card-edge card-lift bg-[#111111] border border-zinc-800 rounded-2xl p-5 shadow-lg flex flex-col justify-between h-full min-h-[260px] min-w-0 overflow-hidden"
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
                                <span
                                  className={`font-mono text-[10px] font-semibold tabular-nums ${
                                    col.matchPending
                                      ? "text-indigo-300 animate-pulse"
                                      : "text-zinc-400"
                                  }`}
                                >
                                  {formatTalentMatchLabel(
                                    col.matchScore,
                                    col.matchPending
                                  )}
                                </span>
                                {!col.matchPending ? (
                                  <ScoreMeter
                                    score={col.matchScore}
                                    className="w-16"
                                  />
                                ) : null}
                              </div>
                            </div>

                            <div className="mb-1">
                              <h3 className="font-bold text-white text-sm">
                                {publicName}
                              </h3>
                              <p className="text-xs text-indigo-400 font-medium mt-0.5">
                                {col.role}
                              </p>
                              <WorkPreferenceTimezoneBadge
                                workPreference={col.workPreference}
                                timezone={col.timezone}
                                className="mt-2"
                              />
                              <div className="mt-2">
                                <VerifiedOnProvixPill
                                  verified={Boolean(col.verifiedOnProvix)}
                                />
                              </div>
                              <span className="inline-flex mt-2 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                                {col.experienceLevel}
                              </span>
                              <p className="text-[11px] text-slate-500 mt-2">
                                {formatTalentEducationLines(col).join(" · ") ||
                                  "Education details not provided"}
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
          {showTalentPoolNav && activeTab === "evaluator" && (
            <div>
              <div className="mb-8">
                <h1 className="text-3xl font-extrabold tracking-tight text-white">Employer AI Screen</h1>
                <p className="text-zinc-300 text-sm mt-2">Paste a candidate's resume or project links to generate a hiring summary.</p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                <div className="lg:col-span-6 card-edge bg-[#111111] rounded-2xl border border-zinc-800 p-7 space-y-5">
                  <input type="text" placeholder="Candidate Target Role" value={evalRole} onChange={(e) => setEvalRole(e.target.value)} className="w-full bg-[#0A0A0A] border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500" />
                  <input type="text" placeholder="Education / Major (Optional)" value={evalMajor} onChange={(e) => setEvalMajor(e.target.value)} className="w-full bg-[#0A0A0A] border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500" />
                  <textarea rows={5} placeholder="Paste Proof of Work or Resume details here..." value={evalAccomplishments} onChange={(e) => setEvalAccomplishments(e.target.value)} className="w-full bg-[#0A0A0A] border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white resize-none focus:outline-none focus:border-indigo-500" />
                  
                  <button onClick={evaluateCandidate} disabled={evaluatingPoW || !evalAccomplishments} className="w-full bg-white hover:bg-slate-200 text-black font-bold py-3.5 rounded-xl text-xs transition-all">
                    {evaluatingPoW ? "Processing..." : "Generate Candidate Brief"}
                  </button>
                </div>

                <div className="lg:col-span-6 card-edge bg-[#111111] rounded-2xl border border-zinc-800 p-6 min-h-[360px]">
                  {employerAuditError ? (
                    <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-300">
                      {employerAuditError}
                    </div>
                  ) : employerAuditResult ? (
                    <AuditResultsPanel result={employerAuditResult} />
                  ) : (
                    <div className="text-slate-500 text-center mt-28 text-sm">
                      Awaiting candidate data...
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {showTalentPoolNav && activeTab === "auditor" && (
            <GitHubResumeAuditor />
          )}

        </div>
        </>
      )}

        <CandidateIntelligenceDrawer
          candidate={intelligenceDrawerCandidate}
          open={selectedCandidate !== null && activeTab === "talent"}
          isUnlocked={
            selectedCandidate
              ? isCandidateUnlocked(selectedCandidate)
              : false
          }
          onClose={() => setSelectedCandidate(null)}
          onRequestIntro={openIntroModal}
          screeningJob={primaryMatchingJob}
          companyName={employerCompanyNameForMatching}
          requireAuth={requireAuth}
          onToast={showToast}
        />

        {/* PUBLIC PROFILE MODAL */}
        {showPublicProfile && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-[#121212] border border-zinc-800 rounded-2xl max-w-xl w-full p-6 relative shadow-2xl overflow-hidden">
              {/* Header / Title */}
              <div className="flex items-center justify-between pb-4 mb-4 border-b border-zinc-800">
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
                  className="text-slate-400 hover:text-white bg-slate-900 w-7 h-7 rounded-lg border border-zinc-800 flex items-center justify-center transition-all cursor-pointer"
                >
                  <Icons.XMark />
                </button>
              </div>

              {/* Profile Card Preview */}
              {isBusinessAccount ? (
                <div className="bg-[#0A0A0A] border border-zinc-800 rounded-xl p-5 mb-5 space-y-4">
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
                  <div className="flex items-center justify-between text-xs bg-slate-900/80 px-3 py-2 rounded-lg border border-zinc-800">
                    <span className="text-slate-300">Active Roles</span>
                    <span className="text-emerald-400 font-mono font-bold">{activeRolesCount}</span>
                  </div>

                  {/* Industry */}
                  <div>
                    <div className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider mb-1">
                      Industry
                    </div>
                    <div className="text-xs font-semibold text-slate-200">
                      {businessProfileData.industry}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-[#0A0A0A] border border-zinc-800 rounded-xl p-5 mb-5 space-y-4">
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
                  <div className="flex items-center justify-between text-xs bg-slate-900/80 px-3 py-2 rounded-lg border border-zinc-800">
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
                    <div className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider mb-1">
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
                    className="flex-1 bg-[#0A0A0A] border border-zinc-800 text-slate-300 text-xs px-3 py-2.5 rounded-xl font-mono focus:outline-none"
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

        <Toast message={toastMessage} variant={toastVariant} />

        {/* POST NEW JOB MODAL (Employer) */}
        {postJobModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="card-edge bg-[#111111] border border-zinc-800 rounded-2xl p-8 max-w-lg w-full relative shadow-2xl max-h-[90vh] overflow-y-auto">
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
                    className="w-full bg-[#0A0A0A] border border-zinc-800 rounded-xl p-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
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
                    required
                    className="w-full bg-[#0A0A0A] border border-zinc-800 rounded-xl p-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
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
                      required
                      className="w-full bg-[#0A0A0A] border border-zinc-800 rounded-xl p-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
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
                        required
                        className="w-full bg-[#0A0A0A] border border-zinc-800 rounded-xl py-3 pr-3 pl-7 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <p className="text-[11px] text-slate-500 mt-2">
                      Example: $80,000 - $100,000 / yr (80k-100k also works)
                    </p>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-400 mb-2 uppercase">
                    Required Skills
                  </label>
                  <input
                    type="text"
                    value={newJobRequiredSkills}
                    onChange={(e) => setNewJobRequiredSkills(e.target.value)}
                    placeholder="Agile, system design, 3+ years backend"
                    required
                    className="w-full bg-[#0A0A0A] border border-zinc-800 rounded-xl p-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                  />
                  <p className="text-[11px] text-slate-500 mt-2">
                    Comma-separated methodologies, experience, or general
                    requirements.
                  </p>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-400 mb-2 uppercase">
                    Tech Stack
                    <span className="ml-1.5 font-medium normal-case tracking-normal text-slate-500">
                      optional
                    </span>
                  </label>
                  <input
                    type="text"
                    value={newJobTechStack}
                    onChange={(e) => setNewJobTechStack(e.target.value)}
                    placeholder="React, TypeScript, Next.js"
                    className="w-full bg-[#0A0A0A] border border-zinc-800 rounded-xl p-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                  />
                  <p className="text-[11px] text-slate-500 mt-2">
                    Optional. Comma-separated tools, languages, and frameworks.
                    Leave blank for non-technical roles.
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
                    className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-xl text-xs transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
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

      </div>
        </div>
      </div>

      {!dashboardNav ? (
        <GuestAuthModal
          open={authModalOpen}
          error={authModalError}
          onClose={() => setAuthModalOpen(false)}
          onError={setAuthModalError}
        />
      ) : null}
    </>
  );
}