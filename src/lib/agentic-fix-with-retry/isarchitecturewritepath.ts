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
import { architectureModuleFolder } from "./architecturemodulefolder";
import { architectureExtension } from "./architectureextension";

export function isArchitectureWritePath(original: string, candidate: string): boolean {
  if (candidate === original) return true;
  const folder = architectureModuleFolder(original);
  const extension = architectureExtension(original);
  if (!candidate.startsWith(`${folder}/`)) return false;
  const rest = candidate.slice(folder.length + 1);
  return rest.length > 0 && !rest.includes("/") && rest.endsWith(extension);
}
