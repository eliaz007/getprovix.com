import fs from "node:fs";
import path from "node:path";
import { SEVERITY_RANK } from "./severity-rank";
import { line } from "./line";
import { key } from "./key";
import { key } from "./key-105";
import { key } from "./key-108";
import { key } from "./key-109";
import { key } from "./key-110";
import { line } from "./line-119";
import { line } from "./line-134";
import { unique } from "./unique";
import { rule } from "./rule";
import { filePath } from "./filepath";

export     const key = [
      violation.severity,
      violation.rule,
      violation.filePath,
      String(violation.line),
      violation.message,
    ].join("\0");
    if (!unique.has(key)) unique.set(key, violation);
  }

  return [...unique.values()].sort(
    (left, right) =>
      SEVERITY_RANK[left.severity] - SEVERITY_RANK[right.severity] ||
      left.filePath.localeCompare(right.filePath) ||
      left.line - right.line ||
      left.rule.localeCompare(right.rule) ||
      left.message.localeCompare(right.message)
  );
}
