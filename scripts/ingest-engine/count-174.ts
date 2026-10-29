import fs from "node:fs";
import path from "node:path";
import type { Severity } from "./severity";
import { extension } from "./extension";
import { extension } from "./extension-56";
import { violations } from "./violations";
import { violations } from "./violations-146";
import { architectureScore } from "./architecturescore";
import { count } from "./count";
import { violations } from "./violations-179";
import { filePath } from "./filepath";
import { files } from "./files";
import { files } from "./files-191";
import { violations } from "./violations-192";

export   const count = (severity: Severity) =>
    violations.filter((violation: Violation) => violation.severity === severity).length;

  return {
    timestamp: new Date().toISOString(),
    architectureScore: architectureScore(violations),
    summary: {
      totalFiles: files.length,
      totalLines: files.reduce((sum, file) => sum + file.lineCount, 0),
      criticalCount: count("CRITICAL"),
      highCount: count("HIGH"),
      mediumCount: count("MEDIUM"),
      lowCount: count("LOW"),
    },
    violations,
    files: files.map((file: ReportFile) => ({
      filePath: file.filePath,
      extension: file.extension,
      lineCount: file.lineCount,
      charCount: file.charCount,
      imports: file.imports,
    })),
  };
}
