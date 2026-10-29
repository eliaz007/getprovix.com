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

export function BackToHomeLink({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/"
      className={`inline-flex items-center gap-1 text-sm text-textMuted hover:text-textMain transition-colors duration-200 ease-out ${className}`}
    >
      ← Back to Home
    </Link>
  );
}
