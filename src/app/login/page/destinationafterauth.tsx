"use client";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { OAuthSignInButtons } from "@/components/OAuthSignInButtons";
import { ProvixLogo } from "@/components/ProvixLogo";
import { getPostLoginPath } from "@/lib/admin-access";
import {
  isEmployerSignup,
  loadProfileAccountKind,
  persistAccountRole,
  persistEmployerAccount,
  resolvePostAuthDestination,
  signupMetadataForKind,
  signupRoleFromSearch,
} from "@/lib/account-role";
import {
  CLAIM_AUDIT_INTENT,
  claimPendingProductionAuditResult,
} from "@/lib/production-audit";
import {
  buildPasswordResetRedirectUrl,
  getStandardEmailValidationMessage,
  normalizeEmail,
} from "@/lib/validate-email";
import { hasCompletedCandidateSetup } from "@/lib/candidate-onboarding";
import { createClient } from "@/utils/supabase/client";
import { supabase } from "./supabase";
import type { SignUpType } from "./signuptype";
import { appendAuthQuery } from "./appendauthquery";

export async function destinationAfterAuth(
  user: User,
  search: string,
  signupKind?: SignUpType
): Promise<string> {
  const profileKind = await loadProfileAccountKind(supabase, user.id);
  const role =
    signupKind === "business"
      ? "employer"
      : profileKind;
  const params = new URLSearchParams(search);

  let setupComplete: boolean | null = null;
  if (role === "candidate") {
    const { data: profile } = await supabase
      .from("profiles")
      .select(
        "full_name, name, first_name, last_name, job_title, headline, bio, skills, experience_level, portfolio_url"
      )
      .eq("id", user.id)
      .maybeSingle();
    setupComplete = hasCompletedCandidateSetup(profile);
  }

  const destination = resolvePostAuthDestination({
    role,
    requestedNext: params.get("next"),
    isAdmin: getPostLoginPath(user) === "/admin",
    setupComplete,
  });

  return appendAuthQuery(destination, search);
}
