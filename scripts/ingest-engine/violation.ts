import fs from "node:fs";
import path from "node:path";
import type { Severity } from "./severity";
import { line } from "./line";
import { line } from "./line-119";
import { line } from "./line-134";
import { rule } from "./rule";
import { filePath } from "./filepath";

export type Violation = {
  filePath: string;
  severity: Severity;
  rule: string;
  message: string;
  line: number;
};
