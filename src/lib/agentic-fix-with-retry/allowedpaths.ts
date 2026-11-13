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
import { isArchitectureFinding } from "./isarchitecturefinding";

export function allowedPaths(category: string, clientPath: string, serverActionPath: string): Set<string> {
  if (category === "SECRET_LEAK") return new Set([clientPath, ".env.example"]);
  if (category === "VULNERABLE_DEPENDENCY") return new Set([clientPath]);
  if (isArchitectureFinding(category)) return new Set([clientPath]);
  return new Set([clientPath, serverActionPath]);
}
