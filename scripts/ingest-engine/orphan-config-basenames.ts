import fs from "node:fs";
import path from "node:path";
import { next } from "./next";

export const ORPHAN_CONFIG_BASENAMES = new Set([
  "next.config.ts",
  "tailwind.config.ts",
  "vitest.config.ts",
  "postcss.config.mjs",
  "next-env.d.ts",
  "robots.ts",
  "sitemap.ts",
  "not-found.tsx",
  "actions.ts",
]);
