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
import type { JobInterestApplicant } from "./jobinterestapplicant";

export type JobInterestRow = {
  job_id: string;
  title: string;
  company: string | null;
  employer_id: string;
  created_at: string;
  interest_count: number;
  applicants: JobInterestApplicant[];
};
