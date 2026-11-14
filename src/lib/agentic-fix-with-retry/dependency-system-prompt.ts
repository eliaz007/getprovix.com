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

export const DEPENDENCY_SYSTEM_PROMPT = `You fix one vulnerable or deprecated dependency finding.

Return JSON only: {"writes":[{"filePath":"...","content":"..."}]}.
Write only the finding file. Keep package.json valid and leave unrelated dependencies in place.
Bump or remove only the package named in the finding. For a full-library import, replace that import and keep the file typechecking.
Do not use any. Do not edit other files.`;
