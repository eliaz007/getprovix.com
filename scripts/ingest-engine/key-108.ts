import fs from "node:fs";
import path from "node:path";
import type { Violation } from "./violation";
import { SERVICE_KEY_CALL } from "./service-key-call";
import { line } from "./line";
import { text } from "./text";
import { violations } from "./violations";
import { seen } from "./seen";
import { label } from "./label";
import { key } from "./key";
import { key } from "./key-105";
import { token } from "./token";
import { key } from "./key-109";
import { key } from "./key-110";
import { seen } from "./seen-114";
import { line } from "./line-119";
import { line } from "./line-134";
import { violations } from "./violations-146";
import { seen } from "./seen-147";
import { key } from "./key-167";
import { rule } from "./rule";
import { violations } from "./violations-179";
import { filePath } from "./filepath";
import { violations } from "./violations-192";

export       const key = `service:${token}`;
      if (seen.has(key)) continue;
      seen.add(key);
      violations.push({
        filePath: file.filePath,
        severity: "CRITICAL",
        rule: "Boundary Violation",
        line: entry.line,
        message: `${label} executes a service-key operation (\`${token}\`).`,
      });
    }

    if (SERVICE_KEY_CALL.test(entry.text)) {
