import fs from "node:fs";
import path from "node:path";
import { specifier } from "./specifier";
import { specifier } from "./specifier-48";
import { resolveSpecifier } from "./resolvespecifier";
import { resolved } from "./resolved";
import { specifier } from "./specifier-133";
import { knownByLower } from "./knownbylower";
import { filePath } from "./filepath";

export       const resolved = resolveSpecifier(file.filePath, specifier, knownByLower);
      if (!resolved || resolved === file.filePath) return;
