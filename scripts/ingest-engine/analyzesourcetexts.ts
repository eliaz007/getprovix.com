import fs from "node:fs";
import path from "node:path";
import type { AuditReport } from "./auditreport";
import { text } from "./text";
import { source } from "./source";
import type { SourceTextFile } from "./sourcetextfile";

/** Run the firewall rules on source text that was not read from the local disk. */
export function analyzeSourceTexts(
  sources: SourceTextFile[],
  options?: { includeOrphans?: boolean }
): AuditReport {
