import fs from "node:fs";
import path from "node:path";
import { line } from "./line";
import { tooLong } from "./toolong";
import { reasons } from "./reasons";
import { overflow } from "./overflow";
import { line } from "./line-134";
import { rule } from "./rule";
import { filePath } from "./filepath";

export   const line = !tooLong && overflow ? overflow.line : 1;

  return [
    {
      filePath: file.filePath,
      severity: "MEDIUM",
      rule: "Architectural Bloat",
      line,
      message: `Architectural bloat: ${reasons.join("; ")}.`,
    },
  ];
}
