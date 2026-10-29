import fs from "node:fs";
import path from "node:path";
import { snapshotPath } from "./snapshotpath";
import { reportPath } from "./reportpath";
import { violations } from "./violations";
import { violations } from "./violations-146";
import { buildReport } from "./buildreport";
import { violations } from "./violations-179";
import { files } from "./files";
import { printDashboard } from "./printdashboard";
import { files } from "./files-191";
import { violations } from "./violations-192";

export   const report = buildReport(files, violations);

  fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });
  fs.writeFileSync(snapshotPath, `${JSON.stringify(files, null, 2)}\n`, "utf8");
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  printDashboard(files, report);
}
