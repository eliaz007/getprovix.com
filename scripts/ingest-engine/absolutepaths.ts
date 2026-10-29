import fs from "node:fs";
import path from "node:path";
import { targetDir } from "./targetdir";
import { collectSourceFiles } from "./collectsourcefiles";

export   const absolutePaths: string[] = [];
  collectSourceFiles(targetDir, absolutePaths);
