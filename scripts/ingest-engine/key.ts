import fs from "node:fs";
import path from "node:path";
import type { Violation } from "./violation";
import { ENV_DOT } from "./env-dot";
import { ENV_BRACKET } from "./env-bracket";
import { specifier } from "./specifier";
import { line } from "./line";
import { specifier } from "./specifier-48";
import { rawContent } from "./rawcontent";
import { executableLines } from "./executablelines";
import { violations } from "./violations";
import { seen } from "./seen";
import { label } from "./label";
import { key } from "./key-105";
import { key } from "./key-108";
import { key } from "./key-109";
import { key } from "./key-110";
import { seen } from "./seen-114";
import { line } from "./line-119";
import { specifier } from "./specifier-133";
import { line } from "./line-134";
import { violations } from "./violations-146";
import { seen } from "./seen-147";
import { key } from "./key-167";
import { rule } from "./rule";
import { violations } from "./violations-179";
import { filePath } from "./filepath";
import { violations } from "./violations-192";

export     const key = `import:${statement.specifier}:${statement.line}`;
    if (seen.has(key)) continue;
    seen.add(key);
    violations.push({
      filePath: file.filePath,
      severity: "CRITICAL",
      rule: "Boundary Violation",
      line: statement.line,
      message: `${label} directly imports an admin/service-role client from \`${statement.specifier}\`.`,
    });
  }

  for (const entry of executableLines(file.rawContent)) {
    ENV_DOT.lastIndex = 0;
    ENV_BRACKET.lastIndex = 0;
