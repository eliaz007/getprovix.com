import fs from "node:fs";
import path from "node:path";
import { projectRoot } from "./projectroot";
import { audit } from "./audit";
import { report } from "./report";

export const reportPath = path.join(projectRoot, "scripts", "audit-report.json");
