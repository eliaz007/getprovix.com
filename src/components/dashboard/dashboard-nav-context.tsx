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

export type ProfileStudioSection = "profile" | "proof_of_work" | "settings";

type DashboardNavContextValue = {
  activeTab: DashboardTab;
  setActiveTab: (tab: DashboardTab) => void;
  setDefaultTab: (tab: DashboardTab) => void;
  profileStudioSection: ProfileStudioSection;
  setProfileStudioSection: (section: ProfileStudioSection) => void;
  mobileNavOpen: boolean;
  setMobileNavOpen: (open: boolean) => void;
  accountRole: string | null;
  setAccountRole: (role: string | null) => void;
  isVerifiedEmployer: boolean;
  setIsVerifiedEmployer: (verified: boolean) => void;
  userId: string | null;
  userAvatarUrl: string | null;
  userInitials: string;
  userDisplayName: string;
  setUserDisplayName: (name: string | null) => void;
  availabilityStatus: AvailabilityStatus | null;
  setAvailabilityStatus: (status: AvailabilityStatus | null) => void;
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

const AUTH_BOOTSTRAP_TIMEOUT_MS = 1500;

const DashboardNavContext = createContext<DashboardNavContextValue | null>(null);

function initialsFromDisplayName(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const first = parts[0]?.[0] ?? "";
    const last = parts[parts.length - 1]?.[0] ?? "";
    return `${first}${last}`.toUpperCase();
  }

  return (parts[0] ?? "DE").slice(0, 2).toUpperCase();
}

function resolveUserDisplayName(
  profileFullName?: string | null,
  user?: User | null
): string {
  const meta = user?.user_metadata ?? {};
  return (
    (typeof profileFullName === "string" && profileFullName.trim()) ||
    (typeof meta.full_name === "string" && meta.full_name.trim()) ||
    (typeof meta.name === "string" && meta.name.trim()) ||
    "Developer"
  );
}

function getUserHeaderIdentity(
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

function readClientTabParam(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return new URLSearchParams(window.location.search).get("tab");
}

function DashboardNavProviderFromSearch({
  children,
  tabHold,
}: {
  children: ReactNode;
  tabHold: MutableRefObject<DashboardTab | null>;
}) {
  const searchParams = useSearchParams();
  return (
    <DashboardNavProviderImpl tabParam={searchParams.get("tab")} tabHold={tabHold}>
      {children}
    </DashboardNavProviderImpl>
  );
}

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

function DashboardNavProviderImpl({
  children,
  tabParam,
  tabHold,
}: {
  children: ReactNode;
  tabParam: string | null;
  tabHold: MutableRefObject<DashboardTab | null>;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const urlTab = isDashboardRootPath(pathname)
    ? dashboardTabFromSearchParam(tabParam)
    : null;
  const pathTab = resolveDashboardTabFromLocation(pathname, tabParam);
  const [userTab, setUserTab] = useState<DashboardTab | null>(
    () => urlTab ?? (isDashboardRootPath(pathname) ? tabHold.current : null)
  );
  const [profileStudioSection, setProfileStudioSection] =
    useState<ProfileStudioSection>("profile");
  const [seenPathname, setSeenPathname] = useState(pathname);
  const userSelectedTabRef = useRef(Boolean(urlTab));
  const didStripTabQueryRef = useRef(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [accountRole, setAccountRole] = useState<string | null>(null);
  const [isVerifiedEmployer, setIsVerifiedEmployer] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [userAvatarUrl, setUserAvatarUrl] = useState<string | null>(null);
  const [userInitials, setUserInitials] = useState("DE");
  const [userDisplayName, setUserDisplayNameState] = useState("Developer");
  const setUserDisplayName = useCallback((name: string | null) => {
    const displayName = resolveUserDisplayName(name, null);
    setUserDisplayNameState(displayName);
    setUserInitials(initialsFromDisplayName(displayName));
  }, []);
  const [availabilityStatus, setAvailabilityStatus] =
    useState<AvailabilityStatus | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [contentReady, setContentReadyState] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalError, setAuthModalError] = useState<string | null>(null);
  const [onOpenJobApplicants, setOnOpenJobApplicantsState] = useState<
    ((jobId: string) => void) | null
  >(null);

  const locationChanged = seenPathname !== pathname;
  if (locationChanged) {
    setSeenPathname(pathname);
    didStripTabQueryRef.current = false;
    const nextTab = isDashboardRootPath(pathname)
      ? dashboardTabFromSearchParam(tabParam)
      : null;
    tabHold.current = nextTab;
    setUserTab(nextTab);
    userSelectedTabRef.current = Boolean(nextTab);
  }

  const defaultTab = defaultDashboardTabForRole(accountRole);
  const activeTab = isDashboardRootPath(pathname)
    ? (userTab ?? defaultTab)
    : ((locationChanged ? null : userTab) ?? pathTab ?? defaultTab);

  if (isDashboardRootPath(pathname)) {
    tabHold.current = userTab ?? (activeTab === defaultTab ? null : activeTab);
  }

  const setOnOpenJobApplicants = useCallback(
    (handler: ((jobId: string) => void) | null) => {
      // Wrap so React stores the function instead of treating it as a setState updater.
      setOnOpenJobApplicantsState(() => handler);
    },
    []
  );

  const setActiveTab = useCallback((tab: DashboardTab) => {
    userSelectedTabRef.current = true;
    tabHold.current = tab;
    setUserTab(tab);
  }, [tabHold]);

  const setDefaultTab = useCallback((tab: DashboardTab) => {
    if (userSelectedTabRef.current) {
      return;
    }
    tabHold.current = tab;
    setUserTab(tab);
  }, [tabHold]);

  const contentReadyCountRef = useRef(0);
  const setContentReady = useCallback((ready: boolean) => {
    if (ready) {
      contentReadyCountRef.current += 1;
      setContentReadyState(true);
      return;
    }
    contentReadyCountRef.current = Math.max(0, contentReadyCountRef.current - 1);
    if (contentReadyCountRef.current === 0) {
      setContentReadyState(false);
    }
  }, []);

  const requireAuth = useCallback(() => {
    if (userId) {
      return true;
    }
    setAuthModalError(null);
    setAuthModalOpen(true);
    return false;
  }, [userId]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!isDashboardRootPath(pathname) || !urlTab) {
      return;
    }

    userSelectedTabRef.current = true;
    tabHold.current = urlTab;
    setUserTab(urlTab);

    // Keep employer hub tabs in the URL so refresh does not fall back to the
    // candidate profile. Bare candidate /dashboard is redirected in middleware.
    if (isEmployerRole(accountRole) || urlTab !== "my_profile") {
      return;
    }

    if (didStripTabQueryRef.current) {
      return;
    }
    didStripTabQueryRef.current = true;

    const params = new URLSearchParams(window.location.search);
    if (!params.has("tab")) {
      return;
    }

    params.delete("tab");
    const next = `${pathname}${params.toString() ? `?${params}` : ""}`;
    router.replace(next, { scroll: false });
  }, [pathname, urlTab, router, accountRole]);

  useEffect(() => {
    if (!isEmployerRole(accountRole) || !isDashboardRootPath(pathname)) {
      return;
    }

    const search = tabParam ? `?tab=${encodeURIComponent(tabParam)}` : "";
    if (isEmployerAllowedDashboardRequest(pathname, search)) {
      return;
    }

    router.replace(EMPLOYER_DASHBOARD_PATH);
  }, [accountRole, pathname, router, tabParam]);

  useEffect(() => {
    let active = true;
    let authLoadingCleared = false;
    const supabase = createClient();

    const clearAuthLoading = () => {
      if (!active || authLoadingCleared) {
        return;
      }
      authLoadingCleared = true;
      window.clearTimeout(timeoutId);
      setAuthLoading(false);
    };

    const timeoutId = window.setTimeout(clearAuthLoading, AUTH_BOOTSTRAP_TIMEOUT_MS);

    const applyUser = (user: User | null) => {
      if (!user) {
        setUserId(null);
        setUserAvatarUrl(null);
        setUserDisplayName(null);
        setAccountRole(null);
        setIsVerifiedEmployer(false);
        setAvailabilityStatus(null);
        return;
      }

      const identity = getUserHeaderIdentity(user);
      setUserId(user.id);
      setUserAvatarUrl(identity.avatarUrl);
      setUserInitials(identity.initials);
      setUserDisplayNameState(identity.displayName);
      setAuthModalOpen(false);
    };

    const loadProfile = async (user: User) => {
      let profile: {
        role?: string | null;
        is_verified?: boolean | null;
        availability_status?: string | null;
        full_name?: string | null;
      } | null = null;
      console.time("dashboard-layout:profile-fetch");
      const byId = await supabase
        .from("profiles")
        .select("role, is_verified, availability_status, full_name")
        .eq("id", user.id)
        .maybeSingle();
      console.timeEnd("dashboard-layout:profile-fetch");

      profile = byId.data;

      if (!profile) {
        console.time("dashboard-layout:profile-fetch-by-user-id");
        const byUserId = await supabase
          .from("profiles")
          .select("role, is_verified, availability_status, full_name")
          .eq("user_id", user.id)
          .maybeSingle();
        console.timeEnd("dashboard-layout:profile-fetch-by-user-id");
        profile = byUserId.data;

        if (!profile && (byId.error || byUserId.error)) {
          console.time("dashboard-layout:profile-fetch-fallback");
          const fallbackById = await supabase
            .from("profiles")
            .select("role")
            .eq("id", user.id)
            .maybeSingle();
          profile = fallbackById.data;
          if (!profile) {
            const fallbackByUserId = await supabase
              .from("profiles")
              .select("role")
              .eq("user_id", user.id)
              .maybeSingle();
            profile = fallbackByUserId.data;
          }
          console.timeEnd("dashboard-layout:profile-fetch-fallback");
        }
      }

      if (!active) {
        return;
      }

      setIsVerifiedEmployer(profile?.is_verified === true);
      setAvailabilityStatus(parseAvailabilityStatus(profile?.availability_status));
      const namedIdentity = getUserHeaderIdentity(user, profile?.full_name);
      setUserDisplayNameState(namedIdentity.displayName);
      setUserInitials(namedIdentity.initials);

      const assignedRole = normalizeAccountKind(profile?.role);
      if (!assignedRole && !isAdminUser(user)) {
        router.replace(ROLE_ONBOARDING_PATH);
        return;
      }

      setAccountRole(assignedRole);
    };

    const readSession = async () => {
      console.time("dashboard-layout:bootstrap-total");
      console.time("dashboard-layout:auth-check");
      try {
        const {
          data: { session },
        } = await readBrowserSession(supabase);

        if (!active) {
          return;
        }

        const user = session?.user ?? null;
        applyUser(user);
        clearAuthLoading();

        if (user) {
          await loadProfile(user);
        }
      } catch (error) {
        console.error("Dashboard nav session bootstrap failed:", error);
        clearAuthLoading();
      } finally {
        console.timeEnd("dashboard-layout:auth-check");
        console.timeEnd("dashboard-layout:bootstrap-total");
        clearAuthLoading();
      }
    };

    const readSessionIfVisible = () => {
      if (document.visibilityState === "visible") {
        void readSession();
      }
    };

    readSessionIfVisible();
    document.addEventListener("visibilitychange", readSessionIfVisible);

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (!active) {
        return;
      }
      // Never wait on this listener to clear authLoading — INITIAL_SESSION
      // can stall behind a stuck Web Lock on mobile.
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
        void readSession();
      }
    });

    return () => {
      active = false;
      window.clearTimeout(timeoutId);
      document.removeEventListener("visibilitychange", readSessionIfVisible);
      subscription.unsubscribe();
    };
    // Intentionally omit `pathname`: re-bootstrapping auth on every client
    // transition (Pitch Studio / Auditor / Interview Simulator) stalls the
    // shell behind authLoading and reintroduced the navigation deadlock.
  }, [router]);

  const isGuest = !userId;
  const isBusinessAccount = isEmployerRole(accountRole);
  const isEmployeeAccount = isEmployeeRole(accountRole);
  const showTalentPoolNav = canAccessTalentPool(
    accountRole,
    isVerifiedEmployer
  );

  const value = useMemo(
    () => ({
      activeTab,
      setActiveTab,
      setDefaultTab,
      profileStudioSection,
      setProfileStudioSection,
      mobileNavOpen,
      setMobileNavOpen,
      accountRole,
      setAccountRole,
      isVerifiedEmployer,
      setIsVerifiedEmployer,
      userId,
      userAvatarUrl,
      userInitials,
      userDisplayName,
      setUserDisplayName,
      availabilityStatus,
      setAvailabilityStatus,
      authLoading,
      contentReady,
      setContentReady,
      isGuest,
      isBusinessAccount,
      isEmployeeAccount,
      showTalentPoolNav,
      requireAuth,
      authModalOpen,
      authModalError,
      setAuthModalOpen,
      setAuthModalError,
      onOpenJobApplicants,
      setOnOpenJobApplicants,
    }),
    [
      activeTab,
      setActiveTab,
      setDefaultTab,
      profileStudioSection,
      mobileNavOpen,
      accountRole,
      isVerifiedEmployer,
      userId,
      userAvatarUrl,
      userInitials,
      userDisplayName,
      availabilityStatus,
      authLoading,
      contentReady,
      setContentReady,
      isGuest,
      isBusinessAccount,
      isEmployeeAccount,
      showTalentPoolNav,
      requireAuth,
      authModalOpen,
      authModalError,
      onOpenJobApplicants,
      setOnOpenJobApplicants,
    ]
  );

  return (
    <DashboardNavContext.Provider value={value}>
      {children}
    </DashboardNavContext.Provider>
  );
}

export function useDashboardNav() {
  const context = useContext(DashboardNavContext);
  if (!context) {
    throw new Error("useDashboardNav must be used within DashboardNavProvider");
  }
  return context;
}

/** Mark this route as painted. Multiple gates can be mounted; unmounting one
 *  must not flip the shared flag if another route is still ready. */
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
