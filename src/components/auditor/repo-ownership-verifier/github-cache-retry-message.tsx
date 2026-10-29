"use client";
import { useEffect, useRef, useState } from "react";
import { Check, Copy, FileCode2, Loader2, ShieldCheck } from "lucide-react";
import { fetchWithAuth } from "@/lib/fetch-with-auth";
import { readJsonResponse } from "@/lib/read-json-response";
import {
  buildProvixVerificationToken,
  canonicalGitHubRepoUrl,
  hasPersistedProvixTokenVerification,
  PROVIX_FILENAME,
} from "@/lib/provix-token";
import { createClient } from "@/utils/supabase/client";
import { parseGitHubRepoPath } from "@/lib/validate-github-url";

export const GITHUB_CACHE_RETRY_MESSAGE =
  "GitHub's cache might take 10 seconds to update, please try again";
