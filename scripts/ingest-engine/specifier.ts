import fs from "node:fs";
import path from "node:path";
import { lines } from "./lines";
import { specifierIn } from "./specifierin";
import { sourceLines } from "./sourcelines";
import { statements } from "./statements";
import { block } from "./block";
import { blockStart } from "./blockstart";
import { line } from "./line";
import { specifier } from "./specifier-48";
import { lines } from "./lines-64";
import { statements } from "./statements-101";
import { line } from "./line-119";
import { specifier } from "./specifier-133";
import { line } from "./line-134";

export     const specifier = specifierIn(block.join("\n"));
    if (!specifier) return;
    statements.push({ lines: block, specifier, line: blockStart });
    block = null;
  };

  for (let index = 0; index < sourceLines.length; index += 1) {
