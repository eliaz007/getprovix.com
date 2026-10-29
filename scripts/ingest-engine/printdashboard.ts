import fs from "node:fs";
import path from "node:path";
import type { IngestedFile } from "./ingestedfile";
import type { AuditReport } from "./auditreport";
import { files } from "./files";
import { files } from "./files-191";
import { report } from "./report";

export function printDashboard(files: IngestedFile[], report: AuditReport): void {
