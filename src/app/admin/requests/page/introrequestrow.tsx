"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check,
  Copy,
  Loader2,
  Mail,
  Search,
  Shield,
} from "lucide-react";
import SignOutButton from "@/components/SignOutButton";
import { ProvixLogo } from "@/components/ProvixLogo";
import { isAdminUser } from "@/lib/admin-access";
import { readJsonResponse } from "@/lib/read-json-response";
import {
  INTRO_PIPELINE_STATUSES,
  getIntroStatusBadgeClass,
  getIntroStatusLabel,
  normalizeIntroPipelineStatus,
  type IntroPipelineStatus,
} from "@/lib/intro-request-status";
import {
  CANDIDATE_BONUS_RANGE_LABEL,
  FLAT_FEE_AMOUNT,
  FLAT_FEE_THRESHOLD,
  formatCurrency,
  summarizePlacementRevenue,
} from "@/lib/placement-revenue";
import { createClient } from "@/utils/supabase/client";
import type { CandidateDossier } from "./candidatedossier";

export type IntroRequestRow = {
  id: string;
  candidate_name: string | null;
  candidate_id: string;
  company_name: string | null;
  work_email: string | null;
  role_title: string;
  compensation_band: string | null;
  status: IntroPipelineStatus;
  terms_accepted?: boolean | null;
  terms_agreed_at?: string | null;
  agreed_first_year_compensation?: number | null;
  candidate_bonus_allocated?: number | null;
  created_at: string;
  candidate_dossier?: CandidateDossier | null;
};
