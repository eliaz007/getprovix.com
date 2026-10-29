import fs from "node:fs";
import path from "node:path";
import type { ReportFile } from "./reportfile";
import type { Violation } from "./violation";
import { violations } from "./violations";
import { violations } from "./violations-146";
import { architectureScore } from "./architecturescore";
import { violations } from "./violations-179";
import { files } from "./files";
import { files } from "./files-191";
import { violations } from "./violations-192";

export type AuditReport = {
  timestamp: string;
  architectureScore: number;
  summary: {
    totalFiles: number;
    totalLines: number;
    criticalCount: number;
    highCount: number;
    mediumCount: number;
    lowCount: number;
  };
  violations: Violation[];
  files: ReportFile[];
};
