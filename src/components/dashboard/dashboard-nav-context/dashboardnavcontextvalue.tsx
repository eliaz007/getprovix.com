"use client";
import {
  createContext,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import {
  EMPLOYER_DASHBOARD_PATH,
  isEmployerAllowedDashboardRequest,
  normalizeAccountKind,
  ROLE_ONBOARDING_PATH,
} from "@/lib/account-role";
import { isAdminUser } from "@/lib/admin-access";
import {
  canAccessTalentPool,
  dashboardTabFromSearchParam,
  defaultDashboardTabForRole,
  isDashboardRootPath,
  isEmployeeRole,
  isEmployerRole,
  resolveDashboardTabFromLocation,
  type DashboardTab,
} from "@/lib/dashboard-account";
import { createClient } from "@/utils/supabase/client";
import { readBrowserSession } from "@/lib/supabaseClient";
import {
  parseAvailabilityStatus,
  type AvailabilityStatus,
} from "@/lib/availability-status";
import { isVisibleToEmployers } from "@/lib/opportunities-metrics";
import {
  isTalentPoolGitHubLinked,
  isTalentPoolOwnershipVerified,
  meetsMarketplacePublishCriteria,
} from "@/lib/talent-pool-visibility";
import type { ProfileStudioSection } from "./profilestudiosection";

export type DashboardNavContextValue = {
  activeTab: DashboardTab;
  setActiveTab: (tab: DashboardTab) => void;
  setDefaultTab: (tab: DashboardTab) => void;
  profileStudioSection: ProfileStudioSection;
  setProfileStudioSection: (section: ProfileStudioSection) => void;
  mobileNavOpen: boolean;
  setMobileNavOpen: (open: boolean) => void;
  accountRole: string | null;
  setAccountRole: (role: string | null) => void;
  isVerifiedEmployer: boolean | null;
  setIsVerifiedEmployer: (verified: boolean | null) => void;
  userId: string | null;
  userAvatarUrl: string | null;
  userInitials: string;
  userDisplayName: string;
  setUserDisplayName: (name: string | null) => void;
  companyName: string | null;
  setCompanyName: (name: string | null) => void;
  companyNameReady: boolean;
  availabilityStatus: AvailabilityStatus | null;
  setAvailabilityStatus: (status: AvailabilityStatus | null) => void;
  openToFulltime: boolean;
  openToContract: boolean;
  setOpenToFulltime: (open: boolean) => void;
  setOpenToContract: (open: boolean) => void;
  authLoading: boolean;
  contentReady: boolean;
  setContentReady: (ready: boolean) => void;
  isGuest: boolean;
  isBusinessAccount: boolean;
  isEmployeeAccount: boolean;
  showTalentPoolNav: boolean;
  requireAuth: () => boolean;
  authModalOpen: boolean;
  authModalError: string | null;
  setAuthModalOpen: (open: boolean) => void;
  setAuthModalError: (error: string | null) => void;
  onOpenJobApplicants: ((jobId: string) => void) | null;
  setOnOpenJobApplicants: (handler: ((jobId: string) => void) | null) => void;
};
