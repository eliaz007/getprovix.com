import fs from "node:fs";
import path from "node:path";
import type { IngestedFile } from "./ingestedfile";
import type { Violation } from "./violation";
import { files } from "./files";
import { files } from "./files-191";

export function audit(files: IngestedFile[], includeOrphans = true): Violation[] {
