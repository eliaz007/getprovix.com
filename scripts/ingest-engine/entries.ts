import fs from "node:fs";
import path from "node:path";
import { IGNORED_DIRECTORIES } from "./ignored-directories";
import { isHidden } from "./ishidden";
import { name } from "./name";

export   const entries = fs.readdirSync(directory, { withFileTypes: true });

  for (const entry of entries) {
    if (isHidden(entry.name) || IGNORED_DIRECTORIES.has(entry.name)) continue;
