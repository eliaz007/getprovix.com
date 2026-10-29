import fs from "node:fs";
import path from "node:path";
import { extractImportStatements } from "./extractimportstatements";
import { rawContent } from "./rawcontent";
import { filePath } from "./filepath";
import { files } from "./files";
import { files } from "./files-191";

export   const statementsByFile = new Map(
    files.map((file: ReportFile) => [file.filePath, extractImportStatements(file.rawContent)])
  );
