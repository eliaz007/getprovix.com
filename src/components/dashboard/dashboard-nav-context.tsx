"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import {
  canAccessTalentPool,
  isEmployeeRole,
  isEmployerRole,
  type DashboardTab,
} from "@/lib/dashboard-account";
import { createClient } from "@/utils/supabase/client";

type DashboardNavContextValue = {
  activeTab: DashboardTab;
  setActiveTab: (tab: DashboardTab) => void;
  mobileNavOpen: boolean;
  setMobileNavOpen: (open: boolean) => void;
  accountRole: string | null;
  setAccountRole: (role: string | null) => void;
  userId: string | null;
  isBusinessAccount: boolean;
  isEmployeeAccount: boolean;
  showTalentPoolNav: boolean;
  onOpenJobApplicants: ((jobId: string) => void) | null;
  setOnOpenJobApplicants: (handler: ((jobId: string) => void) | null) => void;
};

const DashboardNavContext = createContext<DashboardNavContextValue | null>(null);

function resolveAccountRole(
  profileRole: string | null | undefined,
  user: User | null
): string | null {
  const fromProfile = profileRole?.trim() || null;
  const fromMeta =
    typeof user?.user_metadata?.role === "string"
      ? user.user_metadata.role.trim()
      : null;
  return fromProfile ?? fromMeta;
}

export function DashboardNavProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [activeTab, setActiveTab] = useState<DashboardTab>("my_profile");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [accountRole, setAccountRole] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [onOpenJobApplicants, setOnOpenJobApplicantsState] = useState<
    ((jobId: string) => void) | null
  >(null);

  const setOnOpenJobApplicants = useCallback(
    (handler: ((jobId: string) => void) | null) => {
      setOnOpenJobApplicantsState(handler);
    },
    []
  );

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    let active = true;
    const supabase = createClient();

    const bootstrapSession = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!active) {
        return;
      }

      if (!user) {
        setUserId(null);
        setAccountRole(null);
        router.replace("/login");
        return;
      }

      setUserId(user.id);

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      if (!active) {
        return;
      }

      setAccountRole(resolveAccountRole(profile?.role, user));
    };

    void bootstrapSession();

    return () => {
      active = false;
    };
  }, [router]);

  const isBusinessAccount = isEmployerRole(accountRole);
  const isEmployeeAccount = isEmployeeRole(accountRole);
  const showTalentPoolNav = canAccessTalentPool(accountRole);

  const value = useMemo(
    () => ({
      activeTab,
      setActiveTab,
      mobileNavOpen,
      setMobileNavOpen,
      accountRole,
      setAccountRole,
      userId,
      isBusinessAccount,
      isEmployeeAccount,
      showTalentPoolNav,
      onOpenJobApplicants,
      setOnOpenJobApplicants,
    }),
    [
      activeTab,
      mobileNavOpen,
      accountRole,
      userId,
      isBusinessAccount,
      isEmployeeAccount,
      showTalentPoolNav,
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
