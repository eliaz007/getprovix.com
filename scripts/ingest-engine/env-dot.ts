import fs from "node:fs";
import path from "node:path";

export const ENV_DOT = /process\.env\.([A-Za-z_][A-Za-z0-9_]*)/g;
