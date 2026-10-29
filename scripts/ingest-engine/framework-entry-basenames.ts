import fs from "node:fs";
import path from "node:path";

export const FRAMEWORK_ENTRY_BASENAMES = new Set([
  "page.tsx",
  "page.ts",
  "layout.tsx",
  "layout.ts",
  "route.ts",
  "route.tsx",
  "loading.tsx",
  "loading.ts",
  "error.tsx",
  "error.ts",
  "middleware.ts",
  "middleware.tsx",
  "proxy.ts",
  "proxy.tsx",
]);
