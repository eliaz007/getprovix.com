import fs from "node:fs";
import path from "node:path";
import { FRAMEWORK_ENTRY_BASENAMES } from "./framework-entry-basenames";
import { ORPHAN_CONFIG_BASENAMES } from "./orphan-config-basenames";
import { base } from "./base";
import { filePath } from "./filepath";

export   const base = filePath.split("/").pop() ?? filePath;
  return FRAMEWORK_ENTRY_BASENAMES.has(base) || ORPHAN_CONFIG_BASENAMES.has(base);
}
