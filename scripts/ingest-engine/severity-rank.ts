import fs from "node:fs";
import path from "node:path";
import type { Severity } from "./severity";

export const SEVERITY_RANK: Record<Severity, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};
