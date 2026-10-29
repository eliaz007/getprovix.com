import fs from "node:fs";
import path from "node:path";
import type { IngestedFile } from "./ingestedfile";
import { source } from "./source";
import type { SourceTextFile } from "./sourcetextfile";

export function ingestSourceText(source: SourceTextFile): IngestedFile {
