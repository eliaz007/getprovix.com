import { readFile } from "node:fs/promises";
import path from "node:path";
import { GoogleGenAI } from "@google/genai";
import { finalizeAutofixWrites, type AutofixWriteFile } from "@/lib/autofix-write-validation";
import {
  mergeServerAction,
  SECRET_RULE_CATALOG,
  serverActionFilePath,
  type SecurityFixLayout,
} from "@/lib/scanner/security-suite";

export const CLIENT_DB_SYSTEM_PROMPT = `You refactor one client-side Supabase query into a signed-in server action.

Return JSON only: {"writes":[{"filePath":"...","content":"..."}]}.
Include only the client file and the server action file named in the prompt.
The server action must start with "use server", import createClient from "@/utils/supabase/server", call supabase.auth.getUser(), and return { data, error }.
If the server action file already has exports, keep every existing exported function and append the new one. Never delete or rename existing exports.
Replace the client query with an import of that action. Do not use any. Do not edit other files.`;
