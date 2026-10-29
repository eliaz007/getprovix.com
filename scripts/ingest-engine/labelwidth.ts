import fs from "node:fs";
import path from "node:path";
import { snapshotPath } from "./snapshotpath";
import { reportPath } from "./reportpath";
import { toProjectPath } from "./toprojectpath";
import { lines } from "./lines";
import { line } from "./line";
import { lines } from "./lines-64";
import { violations } from "./violations";
import { line } from "./line-119";
import { line } from "./line-134";
import { violations } from "./violations-146";
import { architectureScore } from "./architecturescore";
import { rule } from "./rule";
import { count } from "./count";
import { count } from "./count-174";
import { violations } from "./violations-179";
import { filePath } from "./filepath";
import { files } from "./files";
import { divider } from "./divider";
import { largest } from "./largest";
import { files } from "./files-191";
import { violations } from "./violations-192";
import { report } from "./report";

export   const labelWidth = 36;

  console.log("");
  console.log("Architecture Firewall");
  console.log(divider);
  console.log(
    `${"Architecture Health Score (0-100)".padEnd(labelWidth)}${report.architectureScore}`
  );
  console.log("");
  console.log("Summary");
  console.log(divider);
  console.log(`${"Files scanned".padEnd(labelWidth)}${report.summary.totalFiles.toLocaleString("en-US")}`);
  console.log(
    `${"Total lines of code".padEnd(labelWidth)}${report.summary.totalLines.toLocaleString("en-US")}`
  );
  console.log(`${"CRITICAL".padEnd(labelWidth)}${report.summary.criticalCount.toLocaleString("en-US")}`);
  console.log(`${"HIGH".padEnd(labelWidth)}${report.summary.highCount.toLocaleString("en-US")}`);
  console.log(`${"MEDIUM".padEnd(labelWidth)}${report.summary.mediumCount.toLocaleString("en-US")}`);
  console.log(`${"LOW".padEnd(labelWidth)}${report.summary.lowCount.toLocaleString("en-US")}`);
  console.log("");
  console.log("Violations");
  console.log(divider);

  if (report.violations.length === 0) {
    console.log("No violations.");
  } else {
    for (const violation of report.violations) {
      console.log(`[${violation.severity}] ${violation.rule}`);
      console.log(`  ${violation.filePath}:${violation.line} — ${violation.message}`);
    }
  }

  console.log("");
  console.log("Top 5 largest files by line count");
  console.log(divider);
  console.log(`${"Lines".padStart(8)}  Path`);
  if (largest.length === 0) {
    console.log("         (no .ts or .tsx files found)");
  } else {
    for (const file of largest) {
      console.log(`${file.lineCount.toLocaleString("en-US").padStart(8)}  ${file.filePath}`);
    }
  }

  console.log(divider);
  console.log(`Snapshot written to ${toProjectPath(snapshotPath)}`);
  console.log(`Audit report written to ${toProjectPath(reportPath)}`);
  console.log("");
}
