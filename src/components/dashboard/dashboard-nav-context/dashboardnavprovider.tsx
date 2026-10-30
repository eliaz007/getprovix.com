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
import { readClientTabParam } from "./readclienttabparam";
import { DashboardNavProviderFromSearch } from "./dashboardnavproviderfromsearch";
import { DashboardNavProviderImpl } from "./dashboardnavproviderimpl";

export function DashboardNavProvider({ children }: { children: ReactNode }) {
  const tabHold = useRef<DashboardTab | null>(null);
  return (
    <Suspense
      fallback={
        <DashboardNavProviderImpl
          tabParam={readClientTabParam()}
          tabHold={tabHold}
        >
          {children}
        </DashboardNavProviderImpl>
      }
    >
      <DashboardNavProviderFromSearch tabHold={tabHold}>
        {children}
      </DashboardNavProviderFromSearch>
    </Suspense>
  );
}
