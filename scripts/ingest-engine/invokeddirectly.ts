import fs from "node:fs";
import path from "node:path";
import { main } from "./main";

export const invokedDirectly = (process.argv[1] ?? "").replace(/\\/g, "/").includes("scripts/ingest-engine.");
if (invokedDirectly) main();
