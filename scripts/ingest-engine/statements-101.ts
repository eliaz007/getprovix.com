import fs from "node:fs";
import path from "node:path";
import { extractImportStatements } from "./extractimportstatements";
import { statements } from "./statements";
import { specifier } from "./specifier";
import { specifier } from "./specifier-48";
import { rawContent } from "./rawcontent";
import { isAdminOrServiceImport } from "./isadminorserviceimport";
import { statementText } from "./statementtext";
import { specifier } from "./specifier-133";

export   const statements = extractImportStatements(file.rawContent);

  for (const statement of statements) {
    if (!isAdminOrServiceImport(statementText(statement), statement.specifier)) continue;
