import fs from "node:fs";
import path from "node:path";
import type { Violation } from "./violation";
import { SERVICE_KEY_TOKEN } from "./service-key-token";
import { line } from "./line";
import { text } from "./text";
import { start } from "./start";
import { violations } from "./violations";
import { label } from "./label";
import { key } from "./key";
import { name } from "./name";
import { key } from "./key-105";
import { key } from "./key-108";
import { key } from "./key-109";
import { key } from "./key-110";
import { line } from "./line-119";
import { line } from "./line-134";
import { start } from "./start-143";
import { violations } from "./violations-146";
import { start } from "./start-152";
import { key } from "./key-167";
import { rule } from "./rule";
import { violations } from "./violations-179";
import { filePath } from "./filepath";
import { violations } from "./violations-192";

export       const reason = name.startsWith("NEXT_PUBLIC_")
        ? "which publishes a secret or service key to the browser"
        : "which does not start with NEXT_PUBLIC_";
      violations.push({
        filePath: file.filePath,
        severity: "CRITICAL",
        rule: "Boundary Violation",
        line: entry.line,
        message: `${label} reads \`process.env.${name}\`, ${reason}.`,
      });
    }

    SERVICE_KEY_TOKEN.lastIndex = 0;
    for (const serviceKey of entry.text.matchAll(SERVICE_KEY_TOKEN)) {
