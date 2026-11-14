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
import { CLIENT_DB_SYSTEM_PROMPT } from "./client-db-system-prompt";
import { SECRET_SYSTEM_PROMPT } from "./secret-system-prompt";
import { DEPENDENCY_SYSTEM_PROMPT } from "./dependency-system-prompt";
import { ARCHITECTURE_SYSTEM_PROMPT } from "./architecture-system-prompt";
import { isArchitectureFinding } from "./isarchitecturefinding";

export function systemInstruction(category: string): string {
  if (category === "SECRET_LEAK") return SECRET_SYSTEM_PROMPT;
  if (category === "VULNERABLE_DEPENDENCY") return DEPENDENCY_SYSTEM_PROMPT;
  if (isArchitectureFinding(category)) return ARCHITECTURE_SYSTEM_PROMPT;
  return CLIENT_DB_SYSTEM_PROMPT;
}
