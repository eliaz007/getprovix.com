import fs from "node:fs";
import path from "node:path";
import type { IngestedFile } from "./ingestedfile";
import { absolutePath } from "./absolutepath";

export function ingestFile(absolutePath: string): IngestedFile {
