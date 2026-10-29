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
import { useDashboardNav } from "./usedashboardnav";

export function DashboardContentGate({ ready }: { ready: boolean }) {
  const { setContentReady } = useDashboardNav();
  const contributedRef = useRef(false);

  useLayoutEffect(() => {
    if (ready && !contributedRef.current) {
      contributedRef.current = true;
      setContentReady(true);
      return;
    }
    if (!ready && contributedRef.current) {
      contributedRef.current = false;
      setContentReady(false);
    }
  }, [ready, setContentReady]);

  useLayoutEffect(() => {
    return () => {
      if (contributedRef.current) {
        contributedRef.current = false;
        setContentReady(false);
      }
    };
  }, [setContentReady]);

  return null;
}
