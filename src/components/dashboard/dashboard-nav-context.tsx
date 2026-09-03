"use client";

import {
  createContext,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { resolveAccountRole } from "@/lib/account-role";
import {
  canAccessTalentPool,
  dashboardTabFromSearchParam,
  isDashboardRootPath,
  isEmployeeRole,
  isEmployerRole,
  resolveDashboardTabFromLocation,
  type DashboardTab,
} from "@/lib/dashboard-account";
import { createClient } from "@/utils/supabase/client";

type DashboardNavContextValue = {
  activeTab: DashboardTab;
  setActiveTab: (tab: DashboardTab) => void;
  setDefaultTab: (tab: DashboardTab) => void;
  mobileNavOpen: boolean;
  setMobileNavOpen: (open: boolean) => void;
  accountRole: string | null;
  setAccountRole: (role: string | null) => void;
  isVerifiedEmployer: boolean;
  setIsVerifiedEmployer: (verified: boolean) => void;
  userId: string | null;
  userAvatarUrl: string | null;
  userInitials: string;
  authLoading: boolean;
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

const AUTH_BOOTSTRAP_TIMEOUT_MS = 8000;

const DashboardNavContext = createContext<DashboardNavContextValue | null>(null);

function getUserHeaderIdentity(user: User): {
  avatarUrl: string | null;
  initials: string;
} {
  const meta = user.user_metadata ?? {};
  const avatarUrl =
    (typeof meta.avatar_url === "string" && meta.avatar_url.trim()) ||
    (typeof meta.picture === "string" && meta.picture.trim()) ||
    null;
  const name =
    (typeof meta.full_name === "string" && meta.full_name.trim()) ||
    (typeof meta.name === "string" && meta.name.trim()) ||
    user.email?.trim() ||
    "";
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "U";

  return { avatarUrl, initials };
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
  const [seenPathname, setSeenPathname] = useState(pathname);
  const userSelectedTabRef = useRef(Boolean(urlTab));
  const didStripTabQueryRef = useRef(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [accountRole, setAccountRole] = useState<string | null>(null);
  const [isVerifiedEmployer, setIsVerifiedEmployer] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [userAvatarUrl, setUserAvatarUrl] = useState<string | null>(null);
  const [userInitials, setUserInitials] = useState("U");
  const [authLoading, setAuthLoading] = useState(true);
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

  const activeTab = isDashboardRootPath(pathname)
    ? (userTab ?? "my_profile")
    : ((locationChanged ? null : userTab) ?? pathTab ?? "my_profile");

  if (isDashboardRootPath(pathname)) {
    tabHold.current = userTab ?? (activeTab === "my_profile" ? null : activeTab);
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

    if (didStripTabQueryRef.current) {
      return;
    }
    didStripTabQueryRef.current = true;
    userSelectedTabRef.current = true;
    tabHold.current = urlTab;
    setUserTab(urlTab);

    const params = new URLSearchParams(window.location.search);
    if (!params.has("tab")) {
      return;
    }

    params.delete("tab");
    const next = `${pathname}${params.toString() ? `?${params}` : ""}`;
    router.replace(next, { scroll: false });
  }, [pathname, urlTab, router]);

  useEffect(() => {
    let active = true;
    const supabase = createClient();
    const timeoutId = window.setTimeout(() => {
      if (active) {
        setAuthLoading(false);
      }
    }, AUTH_BOOTSTRAP_TIMEOUT_MS);

    const bootstrapSession = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!active) {
          return;
        }

        if (!user) {
          setUserId(null);
          setUserAvatarUrl(null);
          setUserInitials("U");
          setAccountRole(null);
          setIsVerifiedEmployer(false);
          return;
        }

        const identity = getUserHeaderIdentity(user);
        setUserId(user.id);
        setUserAvatarUrl(identity.avatarUrl);
        setUserInitials(identity.initials);
        setAuthModalOpen(false);

        let profile: { role?: string | null; is_verified?: boolean | null } | null =
          null;
        const byId = await supabase
          .from("profiles")
          .select("role, is_verified")
          .eq("id", user.id)
          .maybeSingle();

        profile = byId.data;

        if (!profile) {
          const byUserId = await supabase
            .from("profiles")
            .select("role, is_verified")
            .eq("user_id", user.id)
            .maybeSingle();
          profile = byUserId.data;

          if (!profile && (byId.error || byUserId.error)) {
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
          }
        }

        setIsVerifiedEmployer(profile?.is_verified === true);

        if (!active) {
          return;
        }

        setAccountRole(resolveAccountRole(profile?.role, user));
      } catch (error) {
        console.error("Dashboard nav session bootstrap failed:", error);
        if (active) {
          setUserId(null);
          setUserAvatarUrl(null);
          setUserInitials("U");
          setAccountRole(null);
          setIsVerifiedEmployer(false);
        }
      } finally {
        if (active) {
          window.clearTimeout(timeoutId);
          setAuthLoading(false);
        }
      }
    };

    void bootstrapSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (!active) {
        return;
      }
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
        void bootstrapSession();
      }
    });

    return () => {
      active = false;
      window.clearTimeout(timeoutId);
      subscription.unsubscribe();
    };
  }, [pathname]);

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
      mobileNavOpen,
      setMobileNavOpen,
      accountRole,
      setAccountRole,
      isVerifiedEmployer,
      setIsVerifiedEmployer,
      userId,
      userAvatarUrl,
      userInitials,
      authLoading,
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
      mobileNavOpen,
      accountRole,
      isVerifiedEmployer,
      userId,
      userAvatarUrl,
      userInitials,
      authLoading,
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
