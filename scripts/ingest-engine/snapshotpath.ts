import fs from "node:fs";
import path from "node:path";
import { projectRoot } from "./projectroot";

export const snapshotPath = path.join(projectRoot, "scripts", "ingestion-snapshot.json");
