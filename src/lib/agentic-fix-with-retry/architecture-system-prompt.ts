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

export const ARCHITECTURE_SYSTEM_PROMPT = `You split one oversized or tangled component into modules.

Return JSON only: {"writes":[{"filePath":"...","content":"..."}]}.
Include the original file and at least one new module.
Turn the original file into a barrel that re-exports every existing public export.
Put new modules in the folder named in the prompt, using the same extension, and import them with relative paths.
Nested helpers that close over locals must take those values as parameters or import a shared module.
Keep "use client" or "use server" on every file that needs it. Do not use any. Do not edit files outside that folder.`;
