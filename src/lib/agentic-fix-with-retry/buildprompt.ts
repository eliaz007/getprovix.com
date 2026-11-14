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
import type { AgenticFixFinding } from "./agenticfixfinding";
import { taskLines } from "./tasklines";

export function buildPrompt(input: {
  finding: AgenticFixFinding;
  content: string;
  clientPath: string;
  serverActionPath: string;
  importModule: string;
  existingServerAction: string | null;
  existingEnvExample: string | null;
  previous?: { writes: readonly AutofixWriteFile[]; diagnostics: string };
}): string {
  const lines = [
    `Finding: ${input.finding.category} at ${input.clientPath}:${input.finding.line}.`,
    input.finding.snippet ? `Snippet:\n${input.finding.snippet}` : "",
    ...taskLines(input),
    "Current file:",
    input.content,
  ];
  if (input.finding.category === "CLIENT_DB_EXPOSURE" && input.existingServerAction?.trim()) {
    lines.push(
      "Current server action file. Keep every existing export and append the new function:",
      input.existingServerAction
    );
  }
  if (input.finding.category === "SECRET_LEAK" && input.existingEnvExample?.trim()) {
    lines.push("Current .env.example. Keep existing keys and add the new name with an empty value:", input.existingEnvExample);
  }
  if (input.previous) {
    lines.push(
      "The previous patch failed the TypeScript preflight. Fix every diagnostic below and return a new full patch.",
      input.previous.diagnostics,
      "Previous patch:",
      JSON.stringify(input.previous.writes)
    );
  }
  return lines.filter((line: (typeof lines)[number]) => line !== "").join("\n\n");
}
