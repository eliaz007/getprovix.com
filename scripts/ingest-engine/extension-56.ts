import fs from "node:fs";
import path from "node:path";
import { toProjectPath } from "./toprojectpath";
import { countLines } from "./countlines";
import { extractImportLines } from "./extractimportlines";
import { absolutePath } from "./absolutepath";
import { extension } from "./extension";
import { rawContent } from "./rawcontent";
import { filePath } from "./filepath";

export   const extension = path.extname(absolutePath);

  return {
    filePath: toProjectPath(absolutePath),
    extension,
    lineCount: countLines(rawContent),
    charCount: rawContent.length,
    imports: extractImportLines(rawContent),
    rawContent,
  };
}
