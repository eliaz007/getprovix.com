import fs from "node:fs";
import path from "node:path";
import type { IngestedFile } from "./ingestedfile";
import type { Violation } from "./violation";
import type { AuditReport } from "./auditreport";
import { violations } from "./violations";
import { violations } from "./violations-146";
import { violations } from "./violations-179";
import { files } from "./files";
import { files } from "./files-191";
import { violations } from "./violations-192";

export function buildReport(files: IngestedFile[], violations: Violation[]): AuditReport {
