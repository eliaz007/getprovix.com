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

export function isGithubLookupFailure(status: number, message: string): boolean {
  if (status === 404 || status === 502 || status === 504) {
    return true;
  }

  return /not found|could not reach github|timed out/i.test(message);
}
