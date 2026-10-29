import fs from "node:fs";
import path from "node:path";
import { extension } from "./extension";
import { rawContent } from "./rawcontent";
import { extension } from "./extension-56";
import { filePath } from "./filepath";

export type IngestedFile = {
  filePath: string;
  extension: string;
  lineCount: number;
  charCount: number;
  imports: string[];
  rawContent: string;
};
