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
import { initialsFromDisplayName } from "./initialsfromdisplayname";
import { resolveUserDisplayName } from "./resolveuserdisplayname";

export function getUserHeaderIdentity(
  user: User,
  profileFullName?: string | null
): {
  avatarUrl: string | null;
  initials: string;
  displayName: string;
} {
  const meta = user.user_metadata ?? {};
  const avatarUrl =
    (typeof meta.avatar_url === "string" && meta.avatar_url.trim()) ||
    (typeof meta.picture === "string" && meta.picture.trim()) ||
    null;
  const displayName = resolveUserDisplayName(profileFullName, user);

  return {
    avatarUrl,
    initials: initialsFromDisplayName(displayName),
    displayName,
  };
}
