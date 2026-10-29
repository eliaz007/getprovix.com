import fs from "node:fs";
import path from "node:path";
import type { Severity } from "./severity";
import { files } from "./files";
import { files } from "./files-191";

export const SCORE_RULES: Record<Severity, { each: number; max?: number }> = {
  CRITICAL: { each: 20, max: 60 },
  HIGH: { each: 10, max: 30 },
  // 1.25 points each, with no ceiling: 48 bloated files score 40, and further files keep falling.
  MEDIUM: { each: 1.25 },
  LOW: { each: 0.5 },
};
