import fs from "node:fs";
import path from "node:path";
import type { Violation } from "./violation";
import { line } from "./line";
import { violations } from "./violations";
import { seen } from "./seen";
import { label } from "./label";
import { key } from "./key";
import { key } from "./key-105";
import { key } from "./key-108";
import { key } from "./key-109";
import { seen } from "./seen-114";
import { line } from "./line-119";
import { line } from "./line-134";
import { violations } from "./violations-146";
import { seen } from "./seen-147";
import { key } from "./key-167";
import { rule } from "./rule";
import { raw } from "./raw";
import { violations } from "./violations-179";
import { filePath } from "./filepath";
import { violations } from "./violations-192";

export       const key = "sql";
      if (!seen.has(key)) {
        seen.add(key);
        violations.push({
          filePath: file.filePath,
          severity: "CRITICAL",
          rule: "Boundary Violation",
          line: entry.line,
          message: `${label} executes raw SQL.`,
        });
      }
    }
  }

  return violations;
}
