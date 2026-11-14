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

export const SECRET_SYSTEM_PROMPT = `You remove one hardcoded secret or API key.

Return JSON only: {"writes":[{"filePath":"...","content":"..."}]}.
Write only the finding file and, when the secret is in source rather than an env file, .env.example.
Replace the secret with process.env.THE_ENV_NAME. .env.example may contain only NAME= with an empty value.
Do not leave the raw key in any file. Do not invent a replacement key. Do not use any. Do not edit other files.`;
