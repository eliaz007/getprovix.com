import fs from "node:fs";
import path from "node:path";
import { countLines } from "./countlines";
import { extractImportLines } from "./extractimportlines";
import { extension } from "./extension";
import { rawContent } from "./rawcontent";
import { extension } from "./extension-56";
import { source } from "./source";

export   const filePath = source.filePath.split("\\").join("/");
  return {
    filePath,
    extension: path.posix.extname(filePath),
    lineCount: countLines(source.content),
    charCount: source.content.length,
    imports: extractImportLines(source.content),
    rawContent: source.content,
  };
}
