import fs from "node:fs";
import path from "node:path";
import type { IngestedFile } from "./ingestedfile";
import type { Violation } from "./violation";
import type { ImportStatement } from "./importstatement";
import { statements } from "./statements";
import { statements } from "./statements-101";

export function bloatViolations(file: IngestedFile, statements: ImportStatement[]): Violation[] {
