import fs from "node:fs";
import path from "node:path";
import { projectRoot } from "./projectroot";

export const targetDir = path.resolve(projectRoot, process.argv[2] ?? ".");
