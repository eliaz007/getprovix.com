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

export function appendAuthQuery(
  path: string,
  search: string
): string {
  const params = new URLSearchParams(search);
  const verified = params.get("employer_verified");
  const verifyError = params.get("verify_error");
  const url = new URL(path, "https://getprovix.com");

  if (verified && !url.searchParams.has("employer_verified")) {
    url.searchParams.set("employer_verified", verified);
  }
  if (verifyError && !url.searchParams.has("verify_error")) {
    url.searchParams.set("verify_error", verifyError);
  }

  return `${url.pathname}${url.search}`;
}
