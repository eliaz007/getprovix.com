import fs from "node:fs";
import path from "node:path";
import { bases } from "./bases";
import { base } from "./base";
import { base } from "./base-162";

export   const candidates: string[] = [];
  for (const base of bases) {
    candidates.push(
      base,
      `${base}.ts`,
      `${base}.tsx`,
      `${base}.js`,
      `${base}.jsx`,
      path.join(base, "index.ts"),
      path.join(base, "index.tsx"),
      path.join(base, "index.js"),
      path.join(base, "index.jsx")
    );
  }

  for (const candidate of candidates) {
