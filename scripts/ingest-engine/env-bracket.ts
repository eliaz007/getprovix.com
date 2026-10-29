import fs from "node:fs";
import path from "node:path";

export const ENV_BRACKET = /process\.env\[\s*['"]([A-Za-z_][A-Za-z0-9_]*)['"]\s*\]/g;
